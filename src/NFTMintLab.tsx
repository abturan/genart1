import React, { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import AudioEngine from "./audio/AudioEngine";

// === Utility: deterministic PRNG (cyrb128 + sfc32) ===
function cyrb128(str: string) {
  let h1 = 1779033703, h2 = 3144134277, h3 = 1013904242, h4 = 2773480762;
  for (let i = 0, k; i < str.length; i++) {
    k = str.charCodeAt(i);
    h1 = (h2 ^ Math.imul(h1 ^ k, 597399067)) >>> 0;
    h2 = (h3 ^ Math.imul(h2 ^ k, 2869860233)) >>> 0;
    h3 = (h4 ^ Math.imul(h3 ^ k, 951274213)) >>> 0;
    h4 = (h1 ^ Math.imul(h4 ^ k, 2716044179)) >>> 0;
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067) >>> 0;
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233) >>> 0;
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213) >>> 0;
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179) >>> 0;
  return [(h1 ^ h2 ^ h3 ^ h4) >>> 0, h1, h2, h3];
}
function sfc32(a: number, b: number, c: number, d: number) {
  return function () {
    a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
    let t = (a + b) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    d = (d + 1) | 0;
    t = (t + d) | 0;
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
}
function makeRng(seed: string) {
  const s = cyrb128(seed);
  return sfc32(s[0], s[1], s[2], s[3]);
}
function randHex(bytes = 8) {
  const arr = new Uint8Array(bytes);
  if (typeof crypto !== "undefined" && (crypto as any).getRandomValues) (crypto as any).getRandomValues(arr);
  else {
    for (let i = 0; i < bytes; i++) arr[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(arr).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// === Palettes ===
const PALETTES: string[][] = [
  ["#0f0c29", "#302b63", "#24243e", "#b5ffd9", "#ffcc70"],
  ["#0b132b", "#1c2541", "#3a506b", "#5bc0be", "#c6f1e7"],
  ["#1b1b1b", "#2d3436", "#636e72", "#ffeaa7", "#ff7675"],
  ["#0b0f1a", "#132a13", "#3e6259", "#a1cca5", "#e9ff70"],
  ["#14080e", "#494850", "#799496", "#acc196", "#e9eb9e"],
  ["#0a0a0a", "#1f1f1f", "#3c3c3c", "#d90429", "#ffba08"],
];

const ALGORITHMS = [
  { key: 0, name: "Nebula Flow" },
  { key: 1, name: "Crystal Lattice" },
  { key: 2, name: "Ink Blot" },
  { key: 3, name: "Marble Rings" },
  { key: 4, name: "Moire Waves" },
  { key: 5, name: "Checker Warp" },
  { key: 6, name: "Truchet Tiles" },
  { key: 7, name: "Tri Grid" },
  { key: 8, name: "Galaxy Swirl" },
  { key: 9, name: "Curl Fog" },
  { key: 10, name: "Lava Flow" },
  { key: 11, name: "Glacier" },
  { key: 12, name: "Plasma" },
  { key: 13, name: "Sunburst" },
  { key: 14, name: "City Circuit" },
  { key: 15, name: "Weave" },
  { key: 16, name: "Bloom Orbs" },
  { key: 17, name: "Ripples" },
  { key: 18, name: "Zebra Flow" },
  { key: 19, name: "Smoke" },
  { key: 20, name: "Crystal Shards" },
  { key: 21, name: "Cell Outlines" },
  { key: 22, name: "Kaleidoscope" },
  { key: 23, name: "Tiled Perlin" },
  { key: 24, name: "Ridged Noise" },
  { key: 25, name: "Wood Grain" },
  { key: 26, name: "Aurora" },
  { key: 27, name: "Digital Rain" },
  { key: 28, name: "Cross Waves" },
  { key: 29, name: "Organic Net" },
  { key: 30, name: "Contours" },
  { key: 31, name: "Embers" },
  { key: 32, name: "Vortex Grid" },
  { key: 33, name: "Hex Flux" },
{ key: 34, name: "Amber Hive" },
{ key: 35, name: "Crystal Honey" },
{ key: 36, name: "Hex Drift" },
{ key: 37, name: "Pulse Hive" },

{ key: 38, name: "Polar Bloom" },
{ key: 39, name: "Solar Petals" },
{ key: 40, name: "Radial Lace" },
{ key: 41, name: "Petal Mirage" },
{ key: 42, name: "Iris Spinner" },

{ key: 43, name: "Warped Stripes" },
{ key: 44, name: "Slalom" },
{ key: 45, name: "Banded Silk" },
{ key: 46, name: "Ribbon Field" },
{ key: 47, name: "Taffy Lines" },

{ key: 48, name: "Voronoi Sparks" },
{ key: 49, name: "Crackle Edge" },
{ key: 50, name: "Broken Glass" },
{ key: 51, name: "Lightning Cells" },
{ key: 52, name: "Pulse Cracks" },

{ key: 53, name: "Orb Rings" },
{ key: 54, name: "Harmonic Halo" },
{ key: 55, name: "Echo Circles" },
{ key: 56, name: "Pulse Rings" },
{ key: 57, name: "Chorus Halo" },

{ key: 58, name: "Rotogrid" },
{ key: 59, name: "Offset Weave" },
{ key: 60, name: "Tilted Lattice" },
{ key: 61, name: "Orbital Grid" },
{ key: 62, name: "Cranked Weave" },

{ key: 63, name: "Flow Field" },
{ key: 64, name: "Advection Mist" },
{ key: 65, name: "Vector Drift" },
{ key: 66, name: "Stream Lines" },
{ key: 67, name: "Whorl Fog" },

{ key: 68, name: "Checker Melt" },
{ key: 69, name: "Drip Board" },
{ key: 70, name: "Melted Tiles" },
{ key: 71, name: "Smear Grid" },
{ key: 72, name: "Soft Check" },

{ key: 73, name: "Ridge Mountain" },
{ key: 74, name: "Blade Ridges" },
{ key: 75, name: "Quartz Ridge" },
{ key: 76, name: "Sawback" },
{ key: 77, name: "Opal Rims" },

{ key: 78, name: "Turbulence" },
{ key: 79, name: "Haze Storm" },
{ key: 80, name: "Boil Field" },
{ key: 81, name: "Vapor Flux" },
{ key: 82, name: "Dust Surge" },

{ key: 83, name: "Curl Stream" },
{ key: 84, name: "Kármán Trails" },
{ key: 85, name: "Vortex Sheets" },
{ key: 86, name: "Wake Curl" },
{ key: 87, name: "Spiral Drift" },

{ key: 88, name: "Lissajous Net" },
{ key: 89, name: "Phase Weave" },
{ key: 90, name: "Chirp Cross" },
{ key: 91, name: "Beat Grid" },
{ key: 92, name: "Interfere" },

{ key: 93, name: "Spiral Garden" },
{ key: 94, name: "Golden Coil" },
{ key: 95, name: "Log Spiral" },
{ key: 96, name: "Fountain Arms" },
{ key: 97, name: "Whirlpool Arch" },

{ key: 98, name: "Tri Bands" },
{ key: 99, name: "Prism Tile" },
{ key: 100, name: "Facet Mesh" },
{ key: 101, name: "Delta Quilt" },
{ key: 102, name: "Trident Weave" },

{ key: 103, name: "Dot Matrix" },
{ key: 104, name: "Bokeh Field" },
{ key: 105, name: "Halftone" },
{ key: 106, name: "Spray Dots" },
{ key: 107, name: "Pearl Scatter" },

{ key: 108, name: "Scanlines" },
{ key: 109, name: "CRT Warp" },
{ key: 110, name: "Interlace" },
{ key: 111, name: "Sync Sweep" },
{ key: 112, name: "Raster Flow" },

{ key: 113, name: "Metaballs" },
{ key: 114, name: "Liquid Nodes" },
{ key: 115, name: "Gel Blobs" },
{ key: 116, name: "Droplet Web" },
{ key: 117, name: "Plasma Beads" },

{ key: 118, name: "Cross Weave" },
{ key: 119, name: "Basket Warp" },
{ key: 120, name: "Loom Drift" },
{ key: 121, name: "Wicker Flux" },
{ key: 122, name: "Twill Waves" },

{ key: 123, name: "Supershape Ring" },
{ key: 124, name: "Star Bloom" },
{ key: 125, name: "Petal Super" },
{ key: 126, name: "Orb Super" },
{ key: 127, name: "Blade Super" },

{ key: 128, name: "Hex Mosaic" },
{ key: 129, name: "Honey Tiles" },
{ key: 130, name: "Bee Net" },
{ key: 131, name: "Cell Carpet" },
{ key: 132, name: "Wax Weave" },
];

type Traits = {
  edition: number;
  seed: string;
  algorithm: string;
  palette: string[];
  warp: number;
  grain: number;
  scale: number;
  speed: number;
};

// === Shaders with camera-reactive inputs ===
const vert = `
precision mediump float;
attribute vec3 aPosition;
varying vec2 vUv;
void main() {
  vUv = aPosition.xy * 0.5 + 0.5;
  gl_Position = vec4(aPosition, 1.0);
}`;

const frag = `
precision highp float;
varying vec2 vUv;
uniform float uTime;
uniform vec2 uRes;
uniform int uMode;
uniform vec3 uC0; uniform vec3 uC1; uniform vec3 uC2; uniform vec3 uC3; uniform vec3 uC4;
uniform float uWarp;
uniform float uScale;
uniform float uGrain;
uniform float uSpeed;
uniform vec4 uInput; // x:flowX y:flowY z:approach w:activity

float PI = 3.141592653589793;
float hash(vec2 p){ p = fract(p*vec2(123.34,456.21)); p += dot(p,p+45.32); return fract(p.x*p.y); }
vec2 hash2(vec2 p){ float n = hash(p); return vec2(n, hash(p+n)); }
float noise(vec2 p){ vec2 i = floor(p); vec2 f = fract(p); float a = hash(i); float b = hash(i+vec2(1.0,0.0)); float c = hash(i+vec2(0.0,1.0)); float d = hash(i+vec2(1.0,1.0)); vec2 u = f*f*(3.0-2.0*f); return mix(a,b,u.x) + (c-a)*u.y*(1.0-u.x) + (d-b)*u.x*u.y; }
float fbm(vec2 p){ float v = 0.0; float a = 0.5; for(int i=0;i<5;i++){ v += a*noise(p); p *= 2.0; a *= 0.5; } return v; }
mat2 rot(float a){ float s=sin(a), c=cos(a); return mat2(c,-s,s,c); }
float checker(vec2 p){ vec2 ip=floor(p); return mod(ip.x+ip.y,2.0); }
float rings(vec2 p, float s){ return 0.5 + 0.5*cos(length(p)*s); }
float radialStripes(vec2 p, float s){ float a=atan(p.y,p.x); return 0.5 + 0.5*sin(a*s); }
vec2 kale(vec2 p, float k){ float ang=atan(p.y,p.x); float r=length(p); float sector=2.0*PI/k; ang=mod(abs(ang), sector); ang=min(ang, sector-ang); return vec2(cos(ang), sin(ang))*r; }
float quant(float x, float q){ return floor(x*q)/q; }
vec2 warp(vec2 p, float k){ return p + k*vec2(noise(p+vec2(5.2,1.3))-0.5, noise(p+vec2(1.7,9.2))-0.5); }
float stripes(vec2 p){ return 0.5 + 0.5*sin(10.0*p.x + 2.0*p.y); }
float voronoi(vec2 p){ vec2 g=floor(p); vec2 f=fract(p); float md=1.0; for(int y=-1;y<=1;y++){ for(int x=-1;x<=1;x++){ vec2 o=vec2(float(x),float(y)); vec2 r=hash2(g+o)-f+o; md=min(md, dot(r,r)); }} return sqrt(md); }
vec3 mix5(vec3 a, vec3 b, vec3 c, vec3 d, vec3 e, float t){ float s=smoothstep(0.0,1.0,t); if(s<0.25) return mix(a,b,s*4.0); if(s<0.5) return mix(b,c,(s-0.25)*4.0); if(s<0.75) return mix(c,d,(s-0.5)*4.0); return mix(d,e,(s-0.75)*4.0); }

// --- NEW HELPERS (add after existing helpers, before main) ---
float h1(float x){ return fract(sin(x*78.233)*43758.5453123); }
vec2  h2(float x){ return vec2(h1(x+0.123), h1(x+4.567)); }
float ridge(float n){ return 2.0*abs(n-0.5); }
float fbmRidged(vec2 p){ float v=0.0; float a=0.5; for(int i=0;i<5;i++){ v += a*ridge(noise(p)); p*=2.0; a*=0.5; } return v; }
float voronoiEdge(vec2 p){
  vec2 g=floor(p), f=fract(p); float md=8.0, sd=8.0;
  for(int y=-1;y<=1;y++){
    for(int x=-1;x<=1;x++){
      vec2 o=vec2(float(x),float(y));
      vec2 r=hash2(g+o)-f+o;
      float d=dot(r,r);
      if(d<md){ sd=md; md=d; } else if(d<sd){ sd=d; }
    }
  }
  return sd-md;
}
float supershape(float theta, float m, float a, float b, float n1, float n2, float n3){
  float t1 = pow(abs(cos(m*theta*0.25)/a), n2);
  float t2 = pow(abs(sin(m*theta*0.25)/b), n3);
  return pow(t1+t2, -1.0/n1);
}

// Factory for modes >= 33 (33..132 => 20 family * 5 variants)
float algoFactory(int mode, vec2 p, vec2 q, float t){
  float id   = float(mode - 33);
  float fam  = floor(mod(id, 20.0));   // 0..19
  float var  = floor(id / 20.0);       // 0..4
  vec2  ph   = h2(id*1.37 + var*2.17);
  float k1   = mix(0.6, 2.6, ph.x);
  float k2   = mix(0.6, 2.6, ph.y);
  float res  = 0.0;

  if (fam < 0.5) { // Hex Flux family
    vec2 u = q*k1;
    vec2 r = fract(u) - 0.5;
    float d = length(r);
    res = smoothstep(0.45, 0.0, d + 0.12*sin(6.0*atan(r.y,r.x) + t*(0.6+k2) + var));
    res = mix(res, fbm(u*1.3 + ph.x*7.1), 0.35);
  } else if (fam < 1.5) { // Polar Bloom
    vec2 r = p*rot(ph.x*6.28318);
    float rr = length(r);
    float a  = atan(r.y,r.x);
    res = 0.5 + 0.5*sin(a*(6.0+2.0*var) + rr*(3.0+k1) - t*(0.5+k2*0.3));
    res = smoothstep(0.2, 0.9, res);
  } else if (fam < 2.5) { // Warped Stripes
    vec2 u = q*vec2(2.0+k1, 2.0+k2);
    float w = sin(u.x*3.0 + 0.7*u.y - 0.5*t) + sin(u.y*2.7 - 0.8*t);
    res = 0.5 + 0.5*sin(w);
  } else if (fam < 3.5) { // Voronoi Edge
    res = smoothstep(0.02, 0.2, voronoiEdge(q*(1.4+k1)) + 0.15*fbm(q*1.2));
  } else if (fam < 4.5) { // Orb Rings
    float rr = length(q) * (2.0+k1);
    res = 0.5 + 0.5*cos(rr*(6.0+2.0*var) - t*(0.6+k2));
    res = smoothstep(0.25, 0.85, res);
  } else if (fam < 5.5) { // Rotogrid
    vec2 u = q*rot(0.35 + ph.x)* (1.0 + 0.3*var);
    float gx = smoothstep(0.48,0.52, fract(u.x*(2.0+k1)));
    float gy = smoothstep(0.48,0.52, fract(u.y*(2.0+k2)));
    res = max(gx, gy) * (0.5+0.5*fbm(u*1.3));
  } else if (fam < 6.5) { // Flow Field
    float e=0.01;
    float n1=fbm(q+vec2(0.0,e));
    float n2=fbm(q+vec2(e,0.0));
    vec2 curl=vec2(n1-n2, n2-n1);
    res = smoothstep(0.25,0.9, fbm(q + (1.0+0.8*var)*curl + 0.3*t));
  } else if (fam < 7.5) { // Checker Melt
    float c = checker(q*(1.5+k1));
    res = smoothstep(0.2, 0.8, abs(0.5 - c + 0.35*fbm(q*1.1 + t*0.3)));
  } else if (fam < 8.5) { // Ridge Mountain
    res = smoothstep(0.2,0.95, fbmRidged(q*(1.0+0.5*var)) );
  } else if (fam < 9.5) { // Turbulence
    float n = 0.0, amp = 0.5; vec2 u=q;
    for(int i=0;i<4;i++){ n += amp*abs(noise(u)); u*=2.0; amp*=0.5; }
    res = smoothstep(0.25,0.9, n);
  } else if (fam < 10.5) { // Curl Stream (variant params)
    float e=0.02+k2*0.02;
    float n1=fbm(q+vec2(0.0,e)); float n2=fbm(q+vec2(e,0.0));
    vec2 curl=vec2(n1-n2, n2-n1);
    res = smoothstep(0.2,0.9, fbm(q + (0.8+0.6*var)*curl + t*0.4));
  } else if (fam < 11.5) { // Lissajous Net
    vec2 u=q*vec2(2.5+k1, 2.0+k2);
    float s = sin(u.x*(2.0+var) + 0.5*t) * sin(u.y*(3.0+var) - 0.4*t);
    res = smoothstep(0.2,0.9, 0.5+0.5*s);
  } else if (fam < 12.5) { // Spiral Garden
    vec2 r = p* (1.2+0.2*var);
    float a = atan(r.y,r.x);
    float rr= length(r);
    res = smoothstep(0.2,0.9, 0.5 + 0.5*sin(a*(4.0+2.0*var) + log(rr+1.0)*(6.0+k1) - t*(0.4+k2)) );
  } else if (fam < 13.5) { // Tri Bands
    vec2 u = q;
    float tri = (sin(u.x*(2.5+var)) + sin((u.x+u.y)*(2.8+0.3*var)) + sin(u.y*(3.0+0.2*var)))*0.333;
    res = smoothstep(0.2,0.9, tri*0.7 + 0.3*fbm(u*1.1));
  } else if (fam < 14.5) { // Dot Matrix
    vec2 u = q*(2.0+k1);
    vec2 cell=floor(u); vec2 f=fract(u)-0.5;
    float rad = 0.35 + 0.25*sin(hash(cell)*6.283 + t*(0.3+0.2*var));
    res = smoothstep(0.45, 0.0, length(f)-rad);
  } else if (fam < 15.5) { // Scanlines
    float s1 = 0.5+0.5*sin(q.y*(8.0+2.0*var) + t*(0.6+k2));
    float s2 = 0.5+0.5*sin(q.x*(9.0+1.5*var) - t*(0.5+k1));
    res = smoothstep(0.35,0.85, max(s1,s2) );
  } else if (fam < 16.5) { // Metaballs (fake via soft min)
    vec2 u=q*(1.2+0.2*var);
    vec2 c1=vec2( sin(t*0.5), cos(t*0.4));
    vec2 c2=vec2( sin(t*0.3+1.7), cos(t*0.6+0.9));
    vec2 c3=vec2( sin(t*0.7+3.1), cos(t*0.2+2.3));
    float d = exp(-6.0*length(u-c1)) + exp(-6.0*length(u-c2)) + exp(-6.0*length(u-c3));
    res = smoothstep(0.15, 0.6, d);
  } else if (fam < 17.5) { // Cross Weave
    vec2 u=q*rot(0.2+0.4*ph.x);
    float a = sin(u.x*(3.0+0.5*var)+0.4*t);
    float b = sin(u.y*(3.2+0.4*var)-0.5*t);
    res = smoothstep(0.2,0.9, 0.5+0.5*(a*b));
  } else if (fam < 18.5) { // Supershape Ring
    vec2 r = p*(1.2+0.2*var);
    float th = atan(r.y,r.x);
    float rr = length(r);
    float ss = supershape(th, 4.0+2.0*var, 1.0, 1.0, 0.3+0.2*var, 1.7+k1, 1.7+k2);
    res = smoothstep(0.05,0.15, abs(rr - ss) );
    res = 1.0 - res;
  } else { // Hex Mosaic
    vec2 u = q*(1.6+0.3*var);
    vec2 id=floor(u);
    vec2 fu=fract(u)-0.5;
    float ang = floor(mod(id.x+id.y,2.0))*3.14159*0.5;
    fu = rot(ang)*fu;
    float d=length(fu - (hash2(id)-0.5)*0.2);
    res = smoothstep(0.4,0.0,d) + 0.25*fbm(u*1.3);
  }

  return clamp(res, 0.0, 1.0);
}

void main(){
  vec2 uv = vUv;
  vec2 p = (uv - 0.5);
  p.x *= uRes.x/uRes.y;

  vec2 flow = clamp(uInput.xy, vec2(-1.0), vec2(1.0));
  float approach = clamp(uInput.z, -1.0, 1.0);
  float activity = clamp(uInput.w, 0.0, 1.0);

  float kSpeed = uSpeed * mix(0.6, 2.2, activity);
  float kScale = uScale * (1.0 - 0.7 * approach);
  float kWarp  = uWarp  * mix(0.7, 2.0, activity);
  float kGrain = uGrain * mix(0.25, 1.8, activity);

  float t = uTime * kSpeed;

  vec2 q = p * kScale + 1.4 * flow;
  q = warp(q + vec2(0.1*t, -0.07*t), kWarp);
  q = warp(q + vec2(0.23*t, 0.19*t), 0.5*kWarp);

  float f1 = fbm(q);
  float f2 = stripes(q + 0.2*vec2(sin(t*0.3), cos(t*0.2)));
  float f3 = 1.0 - voronoi(q*0.8 + 0.5*t);

  float m = 0.0;
  if (uMode == 0) { m = smoothstep(0.2, 1.0, f1*0.7 + 0.3*f2);
  } else if (uMode == 1) { m = smoothstep(0.1, 0.9, 0.6*f3 + 0.4*f2);
  } else if (uMode == 2) { vec2 pm=p; pm.x=abs(pm.x); float g=fbm(pm*1.6 + 0.6*t); m = smoothstep(0.35, 0.95, g);
  } else if (uMode == 3) { m = smoothstep(0.2,1.0, 0.6*rings(q, 6.0 + 3.0*sin(t*0.5)) + 0.4*f1);
  } else if (uMode == 4) { vec2 a=q*1.2; float mm = sin(a.x*2.3)+sin(a.y*2.8+0.3*t)+sin((a.x+a.y)*1.7-0.6*t); m = 0.5+0.5*sin(mm);
  } else if (uMode == 5) { float c = checker(q*2.0); m = smoothstep(0.2,0.8, abs(0.5 - c + 0.3*f1));
  } else if (uMode == 6) { vec2 id=floor(q); vec2 fu=fract(q)-0.5; float r=step(0.5, hash(id)); fu = rot(r>0.5?3.14159*0.5:0.0)*fu; float d=abs(fu.x*fu.x+fu.y*fu.y-0.25); m = smoothstep(0.2, 0.0, d) + 0.3*f1;
  } else if (uMode == 7) { float tri=(sin(q.x*3.0)+sin((q.x+q.y)*3.0)+sin(q.y*3.0))*0.333; m = smoothstep(0.2,0.9, tri*0.7 + 0.3*f1);
  } else if (uMode == 8) { vec2 pr=q; float ang=atan(pr.y,pr.x)+0.8*t; pr*=rot(ang); m = smoothstep(0.2,0.95, fbm(pr*1.0));
  } else if (uMode == 9) { float e=0.01; float n1=fbm(q+vec2(0.0,e)); float n2=fbm(q+vec2(e,0.0)); vec2 curl=vec2(n1-n2, n2-n1); m = smoothstep(0.2, 0.9, fbm(q + 2.0*curl));
  } else if (uMode == 10) { m = smoothstep(0.15, 0.95, f1*0.5 + (1.0-f3)*0.6);
  } else if (uMode == 11) { m = smoothstep(0.35, 0.9, 1.0 - abs(2.0*f1-1.0));
  } else if (uMode == 12) { m = 0.5 + 0.25*sin(q.x*3.1+1.7*t) + 0.25*sin(q.y*2.7-1.2*t);
  } else if (uMode == 13) { m = smoothstep(0.2,0.9, radialStripes(p, 20.0) * (0.6+0.4*f1));
  } else if (uMode == 14) { float g1=smoothstep(0.45,0.55, fract(q.x*2.0)); float g2=smoothstep(0.45,0.55, fract(q.y*2.0)); m = max(g1,g2) * (0.5+0.5*f1);
  } else if (uMode == 15) { float a1=sin(q.x*2.5+0.5*t)*sin(q.y*2.0-0.7*t); float b1=sin((q.x+q.y)*2.2-0.3*t); m = smoothstep(0.2,0.9, 0.5*a1+0.5*b1);
  } else if (uMode == 16) { vec2 id=floor(q); vec2 fu=fract(q)-0.5; vec2 c=hash2(id)*0.3; float d=length(fu-c); m = smoothstep(0.4,0.0,d) + 0.3*f1;
  } else if (uMode == 17) { float r1=0.5+0.5*sin(6.0*length(p)+t); m = smoothstep(0.2,0.9, r1*0.7 + 0.3*f1);
  } else if (uMode == 18) { m = smoothstep(0.15,0.95, abs(sin(q.x*6.0 + 1.5*sin(q.y*2.0+t))) );
  } else if (uMode == 19) { m = smoothstep(0.2, 0.9, fbm(q*0.7));
  } else if (uMode == 20) { m = smoothstep(0.3, 0.95, pow(1.0 - f3, 2.0));
  } else if (uMode == 21) { float vv=voronoi(q*1.2); m = smoothstep(0.15,0.25, vv);
  } else if (uMode == 22) { vec2 pk=kale(p*1.2, 6.0); m = smoothstep(0.2,0.95, fbm(pk*1.5));
  } else if (uMode == 23) { vec2 cell=floor(q); vec2 fu=fract(q); float n=fbm(cell + fu*0.999); m = smoothstep(0.25,0.9, n);
  } else if (uMode == 24) { float r = 1.0 - abs(fbm(q*1.2)*2.0-1.0); m = smoothstep(0.2,0.95, r);
  } else if (uMode == 25) { float w = 0.5 + 0.5*sin(length(q*vec2(1.0,0.6))*4.0 + f1*2.0); m = smoothstep(0.25,0.9,w);
  } else if (uMode == 26) { float aur = 0.5+0.5*sin(q.y*3.0 + 1.5*sin(q.x*0.8 + t*0.7)); m = smoothstep(0.2,0.9, aur);
  } else if (uMode == 27) { float col=floor((q.x+100.0)*8.0); float sp=hash(vec2(col,0.0))*1.5+0.5; float y=fract(q.y*0.5 + t*sp); m = smoothstep(0.85,1.0, y) * (0.6+0.4*f1);
  } else if (uMode == 28) { float s1=sin(q.x*3.0 - t*0.8); float s2=sin(q.y*3.3 + t*0.6); m = smoothstep(0.2,0.9, 0.5+0.5*(s1*s2));
  } else if (uMode == 29) { m = smoothstep(0.2,0.95, f1*(1.0 - smoothstep(0.2,0.8,voronoi(q*1.1))));
  } else if (uMode == 30) { float qn=quant(fbm(q*1.2), 8.0); m = smoothstep(0.2,0.9, qn);
  } else if (uMode == 31) { float spark = step(0.995, hash(floor(q*vec2(20.0,10.0))+t)); m = smoothstep(0.2,0.9, 0.3*f1 + 0.7*spark);
  } else if (uMode == 32) { float a = atan(p.y,p.x) + 0.8*t; vec2 pv = p * rot(a); m = smoothstep(0.2,0.95, fbm(pv*1.1)); } 
  else { m = algoFactory(uMode, p, q, t); }

  vec3 c0=uC0, c1=uC1, c2=uC2, c3=uC3, c4=uC4;
  vec3 col = mix5(c0,c1,c2,c3,c4, clamp(m,0.0,1.0));
  float vig = smoothstep(0.9, 0.2, length(p)); col *= 0.7 + 0.3*vig;
  float g = (hash(uv*uRes + t) - 0.5) * kGrain; col += g;
  col = pow(max(col, 0.0), vec3(0.85));
  gl_FragColor = vec4(col, 1.0);
}`;

export default function NFTMintLab() {
  // Foreground (panel)
  const mountRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.OrthographicCamera | null>(null);
  const shaderRef = useRef<THREE.ShaderMaterial | null>(null);

  // Background (full page)
  const bgMountRef = useRef<HTMLDivElement | null>(null);
  const bgRendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const bgSceneRef = useRef<THREE.Scene | null>(null);
  const bgCameraRef = useRef<THREE.OrthographicCamera | null>(null);
  const bgShaderRef = useRef<THREE.ShaderMaterial | null>(null);

  // Camera reactive signal
  const [camOn, setCamOn] = useState(false);
  const [camErr, setCamErr] = useState<string | null>(null);
  const camSig = useRef({ fx: 0, fy: 0, approach: 0, activity: 0 });
  const effSig = useRef(new THREE.Vector4(0,0,0,0)); // temporally gated effective signal
  const gate = useRef({accX:0, accY:0, accAppr:0, accAct:0, mode:'none' as 'none'|'fx'|'fy'|'approach'|'activity', hold:0});

  const [showHUD, setShowHUD] = useState(true)  

  const [edition, setEdition] = useState(1);

  // ADD
  const audioRef = useRef<AudioEngine|null>(null);
  const [audioOn, setAudioOn] = useState(false);
  const [audioVol, setAudioVol] = useState(0.8);
  const algoIndexRef = useRef(0);


  const [seed, setSeed] = useState(randHex(8));
  const rng = useMemo(() => makeRng(seed), [seed]);



  const traits = useMemo(() => {
    const algoIdx = Math.floor(rng() * ALGORITHMS.length);
    const palIdx = Math.floor(rng() * PALETTES.length);
    const palHex = PALETTES[palIdx];
    return {
      edition, seed, algorithm: ALGORITHMS[algoIdx].name, palette: palHex,
      warp: 0.25 + rng() * 0.85, grain: 0.02 + rng() * 0.08,
      scale: 1.0 + rng() * 3.5, speed: 0.3 + rng() * 1.2,
    } as Traits;
  }, [seed, edition]);

  // Foreground renderer
  useEffect(() => {
    if (!mountRef.current) return;
    const rootEl = mountRef.current;
    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1,1,1,-1,0,1);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    const rect = rootEl.getBoundingClientRect();
    const initW = Math.max(1, Math.floor(rect.width));
    const initH = Math.max(1, Math.floor(rect.height));
    renderer.setSize(initW, initH);
    renderer.setClearColor(0x000000, 1);
    rootEl.appendChild(renderer.domElement);

    const geometry = new THREE.PlaneGeometry(2,2,1,1);
    geometry.setAttribute("aPosition", geometry.getAttribute("position") as THREE.BufferAttribute);
    const mat = new THREE.ShaderMaterial({
      vertexShader: vert, fragmentShader: frag,
      uniforms: {
        uTime: {value:0}, uRes: {value: new THREE.Vector2(initW, initH)}, uMode: {value: 0},
        uC0:{value:new THREE.Color(1,1,1)}, uC1:{value:new THREE.Color(1,1,1)},
        uC2:{value:new THREE.Color(1,1,1)}, uC3:{value:new THREE.Color(1,1,1)}, uC4:{value:new THREE.Color(1,1,1)},
        uWarp:{value:0.4}, uScale:{value:2.2}, uGrain:{value:0.04}, uSpeed:{value:0.6},
        uInput:{value: new THREE.Vector4(0,0,0,0)},
      },
    });
    const quad = new THREE.Mesh(geometry, mat);
    scene.add(quad);

    sceneRef.current = scene; cameraRef.current = camera; rendererRef.current = renderer; shaderRef.current = mat;

    const ro = new ResizeObserver(() => {
      if (!rendererRef.current || !shaderRef.current || !mountRef.current) return;
      const r = mountRef.current.getBoundingClientRect();
      const w = Math.max(1, Math.floor(r.width));
      const h = Math.max(1, Math.floor(r.height));
      rendererRef.current.setSize(w, h, false);
      (shaderRef.current.uniforms.uRes.value as THREE.Vector2).set(w, h);
    });
    ro.observe(rootEl);

    return () => { ro.disconnect(); renderer.dispose(); rootEl.removeChild(renderer.domElement); geometry.dispose(); (mat as any).dispose(); };
  }, []);

  // Background renderer
  useEffect(() => {
    if (!bgMountRef.current) return;
    const host = bgMountRef.current;
    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1,1,1,-1,0,1);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: false });
    renderer.setPixelRatio(Math.min(1.5, window.devicePixelRatio));
    const setBG = () => renderer.setSize(Math.max(1, window.innerWidth), Math.max(1, window.innerHeight), false);
    setBG();
    renderer.setClearAlpha(0);
    host.appendChild(renderer.domElement);
    const geometry = new THREE.PlaneGeometry(2,2,1,1);
    geometry.setAttribute("aPosition", geometry.getAttribute("position") as THREE.BufferAttribute);
    const mat = new THREE.ShaderMaterial({
      vertexShader: vert, fragmentShader: frag,
      uniforms: {
        uTime:{value:0}, uRes:{value:new THREE.Vector2(window.innerWidth, window.innerHeight)}, uMode:{value:0},
        uC0:{value:new THREE.Color(1,1,1)}, uC1:{value:new THREE.Color(1,1,1)},
        uC2:{value:new THREE.Color(1,1,1)}, uC3:{value:new THREE.Color(1,1,1)}, uC4:{value:new THREE.Color(1,1,1)},
        uWarp:{value:0.4}, uScale:{value:2.2}, uGrain:{value:0.04}, uSpeed:{value:0.6},
        uInput:{value: new THREE.Vector4(0,0,0,0)},
      },
    });
    const quad = new THREE.Mesh(geometry, mat);
    scene.add(quad);
    bgSceneRef.current = scene; bgCameraRef.current = camera; bgRendererRef.current = renderer; bgShaderRef.current = mat;
    const onResize = () => setBG();
    window.addEventListener("resize", onResize);
    return () => { window.removeEventListener("resize", onResize); renderer.dispose(); host.removeChild(renderer.domElement); geometry.dispose(); (mat as any).dispose(); };
  }, []);

  // Render loop + temporal gate (3s commit)
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const commitSec = 3.0;
    const releaseHold = 1.2;
    const th = { fx: 0.25, fy: 0.25, appr: 0.2, act: 0.35 };

    const tick = () => {
      const now = performance.now();
      const dt = (now - last) / 1000;
      last = now;

      // Accumulators
      const absFx = Math.abs(camSig.current.fx);
      const absFy = Math.abs(camSig.current.fy);
      const absAp = Math.abs(camSig.current.approach);
      const absAc = Math.abs(camSig.current.activity);

 gate.current.accX   = absFx > th.fx   ? Math.min(gate.current.accX   + dt, commitSec + 1) : Math.max(gate.current.accX   - dt, 0);
gate.current.accY   = absFy > th.fy   ? Math.min(gate.current.accY   + dt, commitSec + 1) : Math.max(gate.current.accY   - dt, 0);
gate.current.accAppr= absAp > th.appr ? Math.min(gate.current.accAppr+ dt, commitSec + 1) : Math.max(gate.current.accAppr- dt, 0);
gate.current.accAct = absAc > th.act  ? Math.min(gate.current.accAct + dt, commitSec + 1) : Math.max(gate.current.accAct - dt, 0);
      if (gate.current.mode === 'none') {
        const vals = [
          {k:'fx', v: gate.current.accX},
          {k:'fy', v: gate.current.accY},
          {k:'approach', v: gate.current.accAppr},
          {k:'activity', v: gate.current.accAct},
        ];
        vals.sort((a,b)=>b.v-a.v);
        if (vals[0].v >= commitSec) {
          gate.current.mode = vals[0].k as any;
          gate.current.hold = releaseHold;
        }
      } else {
        gate.current.hold = Math.max(0, gate.current.hold - dt);
        const under = gate.current.accX < th.fx && gate.current.accY < th.fy && gate.current.accAppr < th.appr && gate.current.accAct < th.act;
        if (under && gate.current.hold === 0) gate.current.mode = 'none';
      }

      // Mix base signal with gated emphasis
      const baseWeight = 0.2;
      const gateWeight = 1.0;
      let gx = baseWeight*camSig.current.fx, gy = baseWeight*camSig.current.fy, ga = baseWeight*camSig.current.approach, gact = baseWeight*camSig.current.activity;
      if (gate.current.mode === 'fx') gx = gateWeight*camSig.current.fx;
      if (gate.current.mode === 'fy') gy = gateWeight*camSig.current.fy;
      if (gate.current.mode === 'approach') ga = gateWeight*camSig.current.approach;
      if (gate.current.mode === 'activity') gact = gateWeight*camSig.current.activity;

      // extra smoothing for output
      const lerp = (a:number,b:number,k:number)=>a+(b-a)*Math.min(Math.max(k,0),1);
      effSig.current.x = lerp(effSig.current.x, gx, 0.15);
      effSig.current.y = lerp(effSig.current.y, gy, 0.15);
      effSig.current.z = lerp(effSig.current.z, ga, 0.12);
      effSig.current.w = lerp(effSig.current.w, gact, 0.12);

      // uniforms and render
      const t = (now) / 1000;
      if (shaderRef.current) {
        shaderRef.current.uniforms.uTime.value = t;
        (shaderRef.current.uniforms.uInput.value as THREE.Vector4).copy(effSig.current);
      }
      if (bgShaderRef.current) {
        bgShaderRef.current.uniforms.uTime.value = t;
        (bgShaderRef.current.uniforms.uInput.value as THREE.Vector4).copy(effSig.current);
      }

      const r = rendererRef.current, s = sceneRef.current, c = cameraRef.current; if (r && s && c) r.render(s,c);
      const br = bgRendererRef.current, bs = bgSceneRef.current, bc = bgCameraRef.current; if (br && bs && bc) br.render(bs, bc);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Sync traits -> uniforms
  useEffect(() => {
    const apply = (mat: THREE.ShaderMaterial | null) => {
      if (!mat) return;
      const idx = ALGORITHMS.findIndex(a => a.name === traits.algorithm);
      const pal = traits.palette.map(h => new THREE.Color(h));
      mat.uniforms.uMode.value = idx;
      mat.uniforms.uWarp.value = traits.warp;
      mat.uniforms.uGrain.value = traits.grain;
      mat.uniforms.uScale.value = traits.scale;
      mat.uniforms.uSpeed.value = traits.speed;
      mat.uniforms.uC0.value = pal[0]; mat.uniforms.uC1.value = pal[1]; mat.uniforms.uC2.value = pal[2]; mat.uniforms.uC3.value = pal[3]; mat.uniforms.uC4.value = pal[4];
    };
    apply(shaderRef.current); apply(bgShaderRef.current); algoIndexRef.current = ALGORITHMS.findIndex(a => a.name === traits.algorithm);

  }, [traits]);

  // Camera: motion/flow estimator (no video shown)
  useEffect(() => {
    if (!camOn) return;
    let stream: MediaStream | null = null;
    let raf = 0;
    const video = document.createElement("video");
    video.autoplay = true; video.muted = true; (video as any).playsInline = true;
    const cvs = document.createElement("canvas");
    const W=96, H=72; cvs.width=W; cvs.height=H;
    const ctx = cvs.getContext("2d", { willReadFrequently: true })!;
    let prev: Uint8ClampedArray | null = null;
    let prevCx = 0.5, prevCy = 0.5;

    const smooth = (a:number, b:number, k=0.35)=> a*(1-k)+b*k;
    const FLOW_GAIN = 2.5, APPROACH_GAIN = 1.6;

    navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false })
      .then(async s => {
        stream = s; video.srcObject = s;
        try { await video.play(); } catch {}
        setCamErr(null);
      })
      .catch(err => { setCamErr(err?.message || "Camera unavailable"); });

    const tick = () => {
      raf = requestAnimationFrame(tick);
      if (!ctx || video.readyState < 2) return;
      ctx.save(); ctx.scale(-1,1); ctx.drawImage(video, -W, 0, W, H); ctx.restore();
      const img = ctx.getImageData(0,0,W,H).data;
      const gray = new Uint8ClampedArray(W*H);
      for (let i=0, j=0; i<img.length; i+=4, j++) gray[j] = (img[i]*0.299 + img[i+1]*0.587 + img[i+2]*0.114) | 0;
      if (prev) {
        let sum=0, sumX=0, sumY=0, cSum=0, eSum=0;
        for (let i=0; i<gray.length; i++) {
          const d = Math.abs(gray[i]-prev[i]); const dv = d/255;
          if (dv < 0.02) continue;
          const x = (i % W)/W; const y = (((i / W) | 0) / H);
          sum += dv; sumX += x*dv; sumY += y*dv;
          const dx=x-0.5, dy=y-0.5; const r2=dx*dx+dy*dy;
          if (r2<0.12) cSum += dv; else eSum += dv;
        }
        if (sum>1e-6) {
          const cx = sumX/sum, cy = sumY/sum;
          const fx = Math.max(-1, Math.min(1, (cx - prevCx) * 6.0 * FLOW_GAIN));
          const fy = Math.max(-1, Math.min(1, (cy - prevCy) * 6.0 * FLOW_GAIN));
          const activity = Math.max(0, Math.min(1, sum / (W*H*0.06)));
          const approach = ((cSum - eSum) / (cSum + eSum + 1e-5)) * APPROACH_GAIN;
          camSig.current.fx = smooth(camSig.current.fx, fx, 0.25);
          camSig.current.fy = smooth(camSig.current.fy, fy, 0.25);
          camSig.current.activity = smooth(camSig.current.activity, activity, 0.2);
          camSig.current.approach = smooth(camSig.current.approach, approach, 0.15);
          prevCx = cx; prevCy = cy;
        }
      }
      prev = gray;
    };
    raf = requestAnimationFrame(tick);

    return () => { cancelAnimationFrame(raf); prev = null; if (stream) stream.getTracks().forEach(t=>t.stop()); };
  }, [camOn]);

  const [minted, setMinted] = useState<{edition:number; seed:string; dataUrl:string; traits:Traits}[]>([]);
  function mintNow(){
    const r = rendererRef.current; if (!r) return;
    const dataUrl = r.domElement.toDataURL("image/png");
    setMinted(prev => [{edition, seed, dataUrl, traits}, ...prev].slice(0,8));
    setEdition(e => e+1);
  }
  function shuffleSeed(){ setSeed(randHex(8)); }
  function downloadPNG(){
    const r = rendererRef.current; if (!r) return;
    const a = document.createElement("a"); a.href = r.domElement.toDataURL("image/png"); a.download = `nft_${edition.toString().padStart(4,"0")}.png`; a.click();
  }
  function downloadJSON(){
    const meta = { name: `Chaos Algorithm #${traits.edition}`, description: "Camera‑reactive shader generative art", seed: traits.seed,
      attributes: [
        { trait_type: "Algorithm", value: traits.algorithm },
        { trait_type: "Warp", value: Number(traits.warp.toFixed(3)) },
        { trait_type: "Grain", value: Number(traits.grain.toFixed(3)) },
        { trait_type: "Scale", value: Number(traits.scale.toFixed(3)) },
        { trait_type: "Speed", value: Number(traits.speed.toFixed(3)) },
        { trait_type: "Palette", value: traits.palette.join(" ") },
      ] };
    const blob = new Blob([JSON.stringify(meta,null,2)], {type:"application/json"});
    const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = `nft_${traits.edition.toString().padStart(4,"0")}.json`; a.click(); URL.revokeObjectURL(url);
  }

  return (
    <div className="min-h-screen w-full text-neutral-100 relative">
      {/* Background renderer mount */}
      <div className="fixed inset-0 -z-20" ref={bgMountRef} />
      <div className="pointer-events-none fixed inset-0 -z-10 bg-black/55" />
      <header className="px-6 pt-6 pb-4 flex items-center justify-between">
        <h1 className="text-xl sm:text-2xl font-semibold tracking-tight">Chaos Algorithm — NFT Mint Lab</h1>
        <div className="hidden sm:flex gap-2 text-xs text-neutral-300"><span>React</span><span>•</span><span>Three.js</span><span>•</span><span>Tailwind</span><span>•</span><span>TypeScript</span></div>
      </header>
      <main className="px-6 pb-8 grid lg:grid-cols-[1fr,420px] gap-6">
        <section className="relative rounded-2xl overflow-hidden border border-neutral-800 bg-black/70 shadow-[0_0_0_1px_rgba(255,255,255,0.03)] h-[56vh] min-h-[320px] md:h-[64vh]">
          <div className="absolute inset-0" ref={mountRef} />
          <div className="absolute left-3 top-3 pointer-events-none select-none">
            <div className="text-[10px] uppercase tracking-wider text-neutral-200/90 bg-neutral-900/70 backdrop-blur px-2 py-1 rounded">
              #{String(edition).padStart(4,"0")} — {traits.algorithm}
            </div>
          </div>
          {true && (
            <div className="absolute right-2 top-2 text-[10px] space-y-1 bg-neutral-900/60 border border-neutral-800 rounded-md p-2">
              <div>fx: {camSig.current.fx.toFixed(2)}</div>
              <div>fy: {camSig.current.fy.toFixed(2)}</div>
              <div>approach: {camSig.current.approach.toFixed(2)}</div>
              <div>activity: {camSig.current.activity.toFixed(2)}</div>
              <div>gate: {gate.current.mode}</div>
            </div>
          )}
        </section>
        <aside className="lg:sticky lg:top-6 h-max">
          <div className="rounded-2xl border border-neutral-800 bg-neutral-900/60 backdrop-blur p-4 flex flex-col gap-3">
            <div>
              <div className="text-sm text-neutral-200">Seed</div>
              <div className="mt-1 flex gap-2">
                <input value={seed} onChange={(e)=>setSeed(e.target.value.replace(/[^0-9a-f]/gi,""))} className="flex-1 bg-neutral-950/70 border border-neutral-700 rounded px-2 py-1 text-sm outline-none focus:border-neutral-400" />
                <button onClick={shuffleSeed} className="px-3 py-1 rounded border border-neutral-700 hover:border-neutral-500">Shuffle</button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="col-span-2">Traits (auto from seed)</div>
              <Trait label="Algorithm" value={traits.algorithm} />
              <Trait label="Warp" value={traits.warp.toFixed(2)} />
              <Trait label="Grain" value={traits.grain.toFixed(2)} />
              <Trait label="Scale" value={traits.scale.toFixed(2)} />
              <Trait label="Speed" value={traits.speed.toFixed(2)} />
              <div className="col-span-2">
                <div className="text-xs text-neutral-300">Palette</div>
                <div className="mt-1 flex items-center gap-1">{traits.palette.map((h,i)=>(<span key={i} className="inline-block w-6 h-6 rounded-sm border border-neutral-800" style={{background:h}} />))}</div>
              </div>
            </div>
            <div className="mt-2 border-t border-neutral-800 pt-3 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <div className="text-sm">Camera‑Reactive Mode</div>
                <button onClick={()=>setCamOn(v=>!v)} className={`px-3 py-1 rounded ${camOn?"bg-white text-black":"border border-neutral-700 hover:border-neutral-500"}`}>{camOn?"On":"Enable"}</button>
              </div>
              <p className="text-[11px] text-neutral-400">3 sn tutarlı hareket yakalanınca güçlü tepki; kısa/kararsız hareketlerde zayıf tepki.</p>
            </div>
            <div className="flex gap-2 pt-2">
              <button onClick={mintNow} className="flex-1 py-2 rounded-xl bg-white text-black font-medium hover:opacity-90">Mint Preview</button>
              <button onClick={downloadPNG} className="px-3 py-2 rounded-xl border border-neutral-700 hover:border-neutral-500">PNG</button>
              <button onClick={downloadJSON} className="px-3 py-2 rounded-xl border border-neutral-700 hover:border-neutral-500">JSON</button>
            </div>
          </div>
        </aside>
      </main>
      <footer className="px-6 pb-6 text-xs text-neutral-300">Vite `server.open` aktif: `npm run dev` ile sayfa otomatik açılır.</footer>
    </div>
  );
}

function Trait({label, value}:{label:string; value:string}){
  return (<div className="rounded border border-neutral-800 px-2 py-1"><div className="text-xs text-neutral-300">{label}</div><div className="text-sm">{value}</div></div>);
}
