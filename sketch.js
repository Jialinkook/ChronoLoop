// NAME: ChronoLoop  
// DATE: 12/01/2026  
// AUTHOR: Jialin Xin  

// INSTRUCTION:
// Shapes fall from the top of the screen, stacking over time.
// When the stack reaches the top, everything is cleared and a new cycle begins.
// Each shape plays a Solfege note (do–re–mi...), with volume decreasing as the stack grows.
// Click anywhere to add a new shape manually.

// -------------------- Global Parameters --------------------
let shapes = [];
let gravity = 0.35;
let spawnEvery = 10;
let loopStarted = false;

// ---- Clearing (time loop) ----
let clearing = false;
let clearY = 0;
let clearSpeed = 18;
let topTriggerMargin = 35;

// ---- Sliding (natural filling effect) ----
let slideProbe = 12;
let slideAccel = 0.09;
let slideFriction = 0.92;
let slideThreshold = 5;

// ---- Smart spawn control ----
let useSmartSpawn = true;

// -------------------- Sound (Solfege Scale) --------------------
const NOTE_FILES = ["do.wav", "re.wav", "mi.wav", "fa.wav", "sol.wav", "la.wav", "si.wav"];
let notes = [];
let noteOrder = [];
let noteIndex = 0;

let lastSoundMs = 0;
let soundCooldown = 70;

// Volume mapping: higher stack → quieter sound
let volMax = 0.55;
let volMin = 0.10;

// Preload sound files
function preload() {
  soundFormats("mp3", "wav");
  notes = NOTE_FILES.map(f => loadSound(f));
}

// Setup canvas and initialize
function setup() {
  createCanvas(windowWidth, windowHeight);
  pixelDensity(1);
  resetNoteOrder(); // Shuffle notes at start
}

// Main draw loop
function draw() {
   // --- Click to enable sound ---
  if (getAudioContext().state !== 'running') {
    background(0);
    textAlign(CENTER, CENTER);
    fill(255);
    textSize(24);
    text("Click to enable sound", width / 2, height / 2);
    return;
  }

  background(0);

  // --- Clearing mode ---
  if (clearing) {
    clearY += clearSpeed;
    for (let s of shapes) s.display(clearY);

    if (clearY >= height + 5) {
      shapes = [];
      clearing = false;
      clearY = 0;
      resetNoteOrder();
    }
    return;
  }

  // --- Normal mode ---
  if (frameCount % spawnEvery === 0) {
    let x = useSmartSpawn ? chooseSpawnX() : random(width);
    addShape(x, -50);
  }

  for (let s of shapes) s.update();
  for (let s of shapes) s.display(-999999);

  // --- Trigger clearing when stack reaches top ---
  let minTop = Infinity;
  for (let s of shapes) {
    if (!s.stopped) continue;
    minTop = min(minTop, s.y - s.r);
  }

  if (minTop <= topTriggerMargin) {
    clearing = true;
    clearY = 0;
  }
 
}

// Mouse click interaction: add shape and play note
function mousePressed() {
  userStartAudio();
  addShape(mouseX, mouseY);
  
  if (!loopStarted) {
    playNextNoteLoop(volumeFromStack());
    loopStarted = true;
  }
}

// Responsive canvas on window resize
function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}

// Create a new shape with random type
function addShape(x, y) {
  let types = ["circle", "square", "triangle", "flower"];
  shapes.push(new Shape(x, y, random(types)));
}

// Smart spawn logic to distribute shapes more evenly
// This part was assisted by ChatGPT – not covered in class.
function chooseSpawnX() {
  let bins = 24;
  let bestBin = floor(random(bins));
  let bestScore = -1;

  for (let b = 0; b < bins; b++) {
    let x = map(b + 0.5, 0, bins, 0, width);
    let surface = supportYAt(x, -999999, 18);
    let score = surface + random(-12, 12);
    if (score > bestScore) {
      bestScore = score;
      bestBin = b;
    }
  }

  return map(bestBin + 0.5, 0, bins, 0, width);
}

// Check surface height at a given x position
// This part was assisted by ChatGPT – not covered in class.
function supportYAt(x, currentY, r) {
  let best = height - r;
  for (let o of shapes) {
    if (!o.stopped) continue;
    let reach = r + o.r;
    if (abs(x - o.x) > reach) continue;
    let surfaceY = o.y - (r + o.r);
    if (surfaceY >= currentY - 0.001) {
      best = min(best, surfaceY);
    }
  }
  return best;
}
// Shuffle the note order for each cycle
function resetNoteOrder() {
  noteOrder = [];
  for (let i = 0; i < notes.length; i++) noteOrder.push(i);

  // Fisher–Yates shuffle
  for (let i = noteOrder.length - 1; i > 0; i--) {
    let j = floor(random(i + 1));
    [noteOrder[i], noteOrder[j]] = [noteOrder[j], noteOrder[i]];
  }

  noteIndex = 0;
}

// Play the next note with adjusted volume
function playNextNote(vol) {
  if (!notes.length) return;

  let now = millis();
  if (now - lastSoundMs < soundCooldown) return;
  lastSoundMs = now;

  let id = noteOrder[noteIndex % noteOrder.length];
  noteIndex++;

  let n = notes[id];
  if (!n) return;

  if (n.isPlaying()) n.stop();
  n.setVolume(constrain(vol, 0, 1));
  n.play();
}

// Determine volume based on stack height
function volumeFromStack() {
  let minTop = Infinity;
  for (let s of shapes) {
    if (!s.stopped) continue;
    minTop = min(minTop, s.y - s.r);
  }

  if (!isFinite(minTop)) return volMax;

  let fillRatio = constrain(1 - minTop / height, 0, 1);
  return lerp(volMax, volMin, fillRatio);
}

// --- Looping version: infinite Solfege playback ---
// This was assisted by ChatGPT – not covered in class.
function playNextNoteLoop(vol) {
  if (!notes.length) return;

  let id = noteOrder[noteIndex % noteOrder.length];
  noteIndex++;

  let n = notes[id];
  if (!n) return;

  n.setVolume(constrain(vol, 0, 1));
  n.play();

  // When this note ends, play the next one
  n.onended(() => {
    playNextNoteLoop(volumeFromStack());
  });
}
// Shape class: handles movement, stacking, and drawing
class Shape {
  constructor(x, y, type) {
    this.x = x;
    this.y = y;
    this.size = random(26, 45);
    this.r = this.size * 0.5;

    this.vx = random(-0.6, 0.6);
    this.vy = 0;

    this.type = type;
    this.angle = random(TWO_PI);
    this.av = random(-0.02, 0.02);

    this.stopped = false;
    this.supportFrames = 0;
    this.prevY = this.y;
    this.levels = floor(random(4, 9));
  }

  update() {
    if (this.stopped) return;

    this.prevY = this.y;
    this.vy += gravity;
    this.x += this.vx;
    this.y += this.vy;
    this.vx *= 0.997;
    this.angle += this.av;

    // Wall collision
    if (this.x - this.r < 0) {
      this.x = this.r;
      this.vx *= -0.35;
    } else if (this.x + this.r > width) {
      this.x = width - this.r;
      this.vx *= -0.35;
    }

    // Stack detection
    let supported = false;
    let hasCandidate = false;
    let bestSurfaceY = null;

    let prevBottom = this.prevY + this.r;
    let currBottom = this.y + this.r;
    if (prevBottom <= height && currBottom >= height) {
      hasCandidate = true;
      bestSurfaceY = height - this.r;
    }

    for (let o of shapes) {
      if (o === this || !o.stopped) continue;
      let reach = this.r + o.r;
      if (abs(this.x - o.x) > reach) continue;

      let surfaceY = o.y - (this.r + o.r);
      let crossed = (this.prevY <= surfaceY) && (this.y >= surfaceY);

      if (this.vy >= 0 && crossed) {
        if (!hasCandidate || surfaceY < bestSurfaceY) {
          bestSurfaceY = surfaceY;
          hasCandidate = true;
        }
      }
    }

    if (hasCandidate) {
      this.y = bestSurfaceY;
      this.vy = 0;
      supported = true;
      this.trySlide();
      this.vx *= slideFriction;
    }

    // Stop detection
    if (supported && abs(this.vx) < 0.08) {
      this.supportFrames++;
      if (this.supportFrames > 10) {
        this.stopped = true;
        this.vx = 0;
        this.vy = 0;
        this.x = Math.round(this.x);
        this.y = Math.round(this.y);
        playNextNote(volumeFromStack());
      }
    } else {
      this.supportFrames = 0;
    }
  }

  trySlide() {
    let leftX = max(this.r, this.x - slideProbe);
    let rightX = min(width - this.r, this.x + slideProbe);

    let leftSurface = supportYAt(leftX, this.y, this.r);
    let rightSurface = supportYAt(rightX, this.y, this.r);

    let leftDrop = leftSurface - this.y;
    let rightDrop = rightSurface - this.y;

    if (leftDrop > slideThreshold || rightDrop > slideThreshold) {
      if (leftDrop > rightDrop) this.vx -= slideAccel;
      else this.vx += slideAccel;
    }
  }

  display(cutY) {
    if (this.y + this.r < cutY) return;

    push();
    translate(this.x, this.y);
    rotate(this.angle);
    noFill();
    stroke(255);

    let outerW = 1.8;
    let innerW = 0.9;

    if (this.type === "circle") {
      for (let i = 0; i < this.levels; i++) {
        let rr = map(i, 0, this.levels - 1, this.size * 0.25, this.size);
        strokeWeight(i === this.levels - 1 ? outerW : innerW);
        ellipse(0, 0, rr);
      }
    } else if (this.type === "square") {
      rectMode(CENTER);
      for (let i = 0; i < this.levels; i++) {
        let rr = map(i, 0, this.levels - 1, this.size * 0.25, this.size);
        strokeWeight(i === this.levels - 1 ? outerW : innerW);
        rect(0, 0, rr, rr);
      }
    } else if (this.type === "triangle") {
      strokeWeight(1.2);
      for (let i = 0; i < this.levels; i++) {
        let t = this.size * (1 - i / this.levels);
        line(-t / 2, 0, t / 2, 0);
      }
    } else if (this.type === "flower") {
      let dots = this.levels * 10;
      let rr = this.size * 0.45;
      strokeWeight(2.2);
      for (let i = 0; i < dots; i++) {
        let ang = TWO_PI * i / dots;
        point(cos(ang) * rr, sin(ang) * rr);
      }
    }

    pop();
  }
}



