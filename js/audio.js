/**
 * @file audio.js
 * @description Web Audio API 기반 순수 신디사이저 사운드 & BGM 멜로디 시퀀서 엔진
 *              - 0KB 외부 음원 애셋, 네트워크 비용 0, 무중단 즉시 연주
 *              - 레트로 칩튠 스타일의 신나는 퍼즐 멜로디 BGM 시퀀서 (멜로디 / 베이스 / 아르페지오)
 *              - BGM 및 SFX(효과음) 독립 ON/OFF 제어 지원
 */

const STORAGE_KEY_BGM_MUTED = 'sr_bgm_muted';
const STORAGE_KEY_SFX_MUTED = 'sr_sfx_muted';

let audioCtx = null;
let noiseBuffer = null;

let isBGMMutedState = false;
let isSFXMutedState = false;

// 로컬 스토리지에서 개별 음소거 설정 복원
try {
  if (typeof window !== 'undefined' && window.localStorage) {
    isBGMMutedState = window.localStorage.getItem(STORAGE_KEY_BGM_MUTED) === '1';
    isSFXMutedState = window.localStorage.getItem(STORAGE_KEY_SFX_MUTED) === '1';
  }
} catch (_) {}

/**
 * Web Audio API 컨텍스트 싱글톤 반환 및 노이즈 버퍼 캐싱
 */
function getAudioContext() {
  if (!audioCtx && typeof window !== 'undefined') {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
      createNoiseBuffer();
    }
  }
  return audioCtx;
}

function createNoiseBuffer() {
  if (!audioCtx) return;
  const bufferSize = Math.floor(audioCtx.sampleRate * 0.2);
  noiseBuffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
  const data = noiseBuffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = Math.random() * 2 - 1;
  }
}

/**
 * 모바일(iOS Safari/카카오 인앱) 첫 인터랙션 시 오디오 컨텍스트 언락 및 BGM 시작
 */
export function unlockAudio() {
  const ctx = getAudioContext();
  if (ctx) {
    if (ctx.state === 'suspended') {
      ctx.resume().then(() => {
        if (!isBGMMutedState && !bgmRunning) {
          startBGM();
        }
      }).catch(() => {});
    } else if (ctx.state === 'running' && !isBGMMutedState && !bgmRunning) {
      startBGM();
    }
  }
}

// --- 음소거 상태 제어 (BGM / SFX 개별 제어) ---

export function isBGMMuted() {
  return isBGMMutedState;
}

export function isBGMActive() {
  return bgmRunning;
}

export function isSFXMuted() {
  return isSFXMutedState;
}

export function toggleBGMMute() {
  isBGMMutedState = !isBGMMutedState;
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(STORAGE_KEY_BGM_MUTED, isBGMMutedState ? '1' : '0');
    }
  } catch (_) {}

  if (isBGMMutedState) {
    stopBGM();
  } else {
    startBGM();
  }
  return isBGMMutedState;
}

export function toggleSFXMute() {
  isSFXMutedState = !isSFXMutedState;
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(STORAGE_KEY_SFX_MUTED, isSFXMutedState ? '1' : '0');
    }
  } catch (_) {}
  return isSFXMutedState;
}

// ==========================================
// 🎵 BGM 멜로디 시퀀서 (Support Robots Theme)
// ==========================================

const NOTES = Object.freeze({
  REST: 0,
  // 2옥타브 베이스
  E2: 82.41, F2: 87.31, G2: 98.00, Gs2: 103.83, A2: 110.00, B2: 123.47,
  // 3옥타브
  C3: 130.81, D3: 146.83, E3: 164.81, F3: 174.61, G3: 196.00, Gs3: 207.65, A3: 220.00, B3: 246.94,
  // 4옥타브
  C4: 261.63, D4: 293.66, E4: 329.63, F4: 349.23, G4: 392.00, A4: 440.00, B4: 493.88,
  // 5옥타브 멜로디
  C5: 523.25, D5: 587.33, E5: 659.25, F5: 698.46, G5: 783.99, Gs5: 830.61, A5: 880.00, B5: 987.77,
  // 6옥타브
  C6: 1046.50, D6: 1174.66, E6: 1318.51,
});

// 64스텝 (4/4박자 8마디 x 16분음표 8개) - 경쾌하고 캐치한 레트로 퍼즐 게임 멜로디
const MELODY_SEQUENCE = [
  // 1마디: Am (상승 아르페지오 리듬)
  NOTES.C5, NOTES.E5, NOTES.A5, NOTES.REST, NOTES.C6, NOTES.B5, NOTES.A5, NOTES.G5,
  // 2마디: F (산뜻한 당김음)
  NOTES.A5, NOTES.REST, NOTES.F5, NOTES.G5, NOTES.A5, NOTES.REST, NOTES.C6, NOTES.REST,
  // 3마디: G (경쾌한 도약)
  NOTES.B5, NOTES.REST, NOTES.G5, NOTES.A5, NOTES.B5, NOTES.REST, NOTES.D6, NOTES.REST,
  // 4마디: Em (해결 후 호흡)
  NOTES.G5, NOTES.E5, NOTES.D5, NOTES.E5, NOTES.G5, NOTES.REST, NOTES.E5, NOTES.REST,

  // 5마디: Am (풍성한 메인 테마 멜로디)
  NOTES.A5, NOTES.E5, NOTES.C5, NOTES.E5, NOTES.A5, NOTES.B5, NOTES.C6, NOTES.D6,
  // 6마디: Dm (클라이맥스 멜로디 라인)
  NOTES.E6, NOTES.D6, NOTES.C6, NOTES.A5, NOTES.D6, NOTES.C6, NOTES.B5, NOTES.A5,
  // 7마디: E7 (긴장감 조성)
  NOTES.B5, NOTES.G5, NOTES.E5, NOTES.G5, NOTES.B5, NOTES.C6, NOTES.B5, NOTES.Gs5,
  // 8마디: Am (기분 좋은 해결)
  NOTES.A5, NOTES.REST, NOTES.E5, NOTES.REST, NOTES.A4, NOTES.REST, NOTES.REST, NOTES.REST,
];

// 64스텝 펑키 베이스라인 (통통 튀는 8비트 베이스)
const BASS_SEQUENCE = [
  // 1마디: Am
  NOTES.A2, NOTES.REST, NOTES.A3, NOTES.REST, NOTES.E3, NOTES.REST, NOTES.A3, NOTES.E3,
  // 2마디: F
  NOTES.F2, NOTES.REST, NOTES.F3, NOTES.REST, NOTES.C3, NOTES.REST, NOTES.F3, NOTES.C3,
  // 3마디: G
  NOTES.G2, NOTES.REST, NOTES.G3, NOTES.REST, NOTES.D3, NOTES.REST, NOTES.G3, NOTES.D3,
  // 4마디: Em
  NOTES.E2, NOTES.REST, NOTES.E3, NOTES.REST, NOTES.B2, NOTES.REST, NOTES.E3, NOTES.B2,

  // 5마디: Am
  NOTES.A2, NOTES.REST, NOTES.A3, NOTES.REST, NOTES.E3, NOTES.REST, NOTES.A3, NOTES.E3,
  // 6마디: Dm
  NOTES.D3, NOTES.REST, NOTES.D4, NOTES.REST, NOTES.A3, NOTES.REST, NOTES.D4, NOTES.A3,
  // 7마디: E7
  NOTES.E2, NOTES.REST, NOTES.E3, NOTES.REST, NOTES.B2, NOTES.REST, NOTES.Gs3, NOTES.B2,
  // 8마디: Am
  NOTES.A2, NOTES.REST, NOTES.E3, NOTES.REST, NOTES.A3, NOTES.REST, NOTES.A2, NOTES.REST,
];

// 64스텝 화음 아르페지오 (배경을 꽉 채워주는 반주)
const ARP_SEQUENCE = [
  // 1마디: Am
  NOTES.A3, NOTES.C4, NOTES.E4, NOTES.C4, NOTES.A3, NOTES.C4, NOTES.E4, NOTES.C4,
  // 2마디: F
  NOTES.F3, NOTES.A3, NOTES.C4, NOTES.A3, NOTES.F3, NOTES.A3, NOTES.C4, NOTES.A3,
  // 3마디: G
  NOTES.G3, NOTES.B3, NOTES.D4, NOTES.B3, NOTES.G3, NOTES.B3, NOTES.D4, NOTES.B3,
  // 4마디: Em
  NOTES.E3, NOTES.G3, NOTES.B3, NOTES.G3, NOTES.E3, NOTES.G3, NOTES.B3, NOTES.G3,

  // 5마디: Am
  NOTES.A3, NOTES.C4, NOTES.E4, NOTES.C4, NOTES.A3, NOTES.C4, NOTES.E4, NOTES.C4,
  // 6마디: Dm
  NOTES.D3, NOTES.F3, NOTES.A3, NOTES.F3, NOTES.D3, NOTES.F3, NOTES.A3, NOTES.F3,
  // 7마디: E7
  NOTES.E3, NOTES.Gs3, NOTES.B3, NOTES.Gs3, NOTES.E3, NOTES.Gs3, NOTES.B3, NOTES.Gs3,
  // 8마디: Am
  NOTES.A3, NOTES.C4, NOTES.E4, NOTES.C4, NOTES.A3, NOTES.C4, NOTES.E4, NOTES.REST,
];

const TEMPO_BPM = 114;
const SECONDS_PER_BEAT = 60.0 / TEMPO_BPM;
const SECONDS_PER_STEP = SECONDS_PER_BEAT / 4; // 16분음표 = 약 0.1315초
const LOOKAHEAD_MS = 25.0;
const SCHEDULE_AHEAD_TIME = 0.12;

let bgmRunning = false;
let bgmMasterGain = null;
let bgmCurrentStep = 0;
let bgmNextNoteTime = 0.0;
let bgmIntervalId = null;
let bgmPadVoices = [null, null, null];
let bgmPadMasterGain = null;

// 8마디 코드 진행에 맞춘 잔잔한 앰비언트 화음 (Am - F - G - Em - Am - Dm - E7 - Am)
// 최상위 성부(High)와 중간 성부(Mid)가 공통음을 유지하며 부드럽게 이어지는 클래식 보이스 리딩
const CHORD_PAD_FREQS = [
  [110.00, 164.81, 261.63], // 1마디: Am (A2, E3, C4)
  [87.31, 174.61, 261.63],  // 2마디: F  (F2, F3, C4)
  [98.00, 146.83, 246.94],  // 3마디: G  (G2, D3, B3)
  [82.41, 164.81, 246.94],  // 4마디: Em (E2, E3, B3)
  [110.00, 164.81, 261.63], // 5마디: Am (A2, E3, C4)
  [146.83, 174.61, 220.00], // 6마디: Dm (D3, F3, A3)
  [82.41, 164.81, 207.65],  // 7마디: E7 (E2, E3, G#3)
  [110.00, 164.81, 261.63], // 8마디: Am (A2, E3, C4)
];

/**
 * 🌌 완전 정온(Zero-Wave) 앰비언트 신스 패드
 * - '우와앙우와앙' 출렁임의 원인이었던 마디별 스웰/페이드 엔벨로프를 완전히 제거.
 * - 단일 순수 사인파(Single Sine)를 사용하여 디튠 간섭으로 인한 진폭 맥놀이(Beating) 0% 달성.
 * - 코드가 바뀔 때만 0.08초의 미세한 크로스페이드로 즉시 전환되며, 마디가 진행되는 동안에는
 *   볼륨이 흔들림 없이 100% 수평으로 완벽히 일정하게 유지됩니다.
 * - 공통음(예: Am과 F 사이의 C4)은 끊지 않고 그대로 서스테인을 유지합니다.
 */
function playPadChord(chordFreqs, time) {
  if (!bgmRunning || isBGMMutedState || !audioCtx || !bgmPadMasterGain) return;

  const CROSSFADE = 0.08;   // 80ms 초미세 무소음 크로스페이드 (볼륨 굴곡 없이 매끄럽게 교체)
  const VOICE_GAIN = 0.007; // 3개 성부 합산 시 잔잔하고 평온한 배경 볼륨 유지

  chordFreqs.forEach((freq, idx) => {
    const current = bgmPadVoices[idx];

    // 이전 마디와 같은 음정이면 끊김 없이 그대로 지속 (자연스러운 서스테인)
    if (current && Math.abs(current.freq - freq) < 0.1) {
      return;
    }

    try {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, time);

      gain.gain.setValueAtTime(0.0001, time);
      gain.gain.linearRampToValueAtTime(VOICE_GAIN, time + CROSSFADE);

      osc.connect(gain);
      gain.connect(bgmPadMasterGain);
      osc.start(time);

      if (current) {
        const oldGain = current.gain;
        const oldOsc = current.osc;
        oldGain.gain.setValueAtTime(oldGain.gain.value, time);
        oldGain.gain.linearRampToValueAtTime(0.0001, time + CROSSFADE);
        oldOsc.stop(time + CROSSFADE + 0.02);
        setTimeout(() => {
          try {
            oldOsc.disconnect();
            oldGain.disconnect();
          } catch (_) {}
        }, (CROSSFADE + 0.1) * 1000);
      }

      bgmPadVoices[idx] = { osc, gain, freq };
    } catch (_) {}
  });
}

function playStepNote(step, time) {
  if (!bgmRunning || isBGMMutedState || !audioCtx) return;

  // 8스텝(1마디)마다 새 코드 보이스를 정온 크로스페이드로 매끄럽게 갱신
  if (step % 8 === 0) {
    const barIndex = Math.floor(step / 8) % CHORD_PAD_FREQS.length;
    playPadChord(CHORD_PAD_FREQS[barIndex], time);
  }

  const leadFreq = MELODY_SEQUENCE[step % MELODY_SEQUENCE.length];
  const bassFreq = BASS_SEQUENCE[step % BASS_SEQUENCE.length];
  const arpFreq = ARP_SEQUENCE[step % ARP_SEQUENCE.length];

  // 1. 메인 멜로디 리드 신스 (키 트래킹 EQ: 불필요한 고주파 잡음 제거 및 멜로디 볼륨 복원)
  if (leadFreq > 0) {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    const filter = audioCtx.createBiquadFilter();

    osc.type = 'square';
    osc.frequency.setValueAtTime(leadFreq, time);

    // 키 트래킹 저역통과 필터: 각 음정 기본주파수의 1.5배로 컷오프를 맞춰 찌르는 3차 이상 배음만 정돈
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(Math.max(800, leadFreq * 1.5), time);
    filter.Q.setValueAtTime(0.7, time);

    // 소프트 어택 + 멜로디 존재감 확보 (0.024 -> 0.038로 복원)
    gain.gain.setValueAtTime(0.001, time);
    gain.gain.linearRampToValueAtTime(0.038, time + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.001, time + SECONDS_PER_STEP * 1.5);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(bgmMasterGain);

    osc.start(time);
    osc.stop(time + SECONDS_PER_STEP * 1.5);
  }

  // 2. 펑키 베이스 (Triangle: 쫀득하고 둥글둥글한 베이스)
  if (bassFreq > 0) {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(bassFreq, time);

    gain.gain.setValueAtTime(0.038, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + SECONDS_PER_STEP * 1.3);

    osc.connect(gain);
    gain.connect(bgmMasterGain);

    osc.start(time);
    osc.stop(time + SECONDS_PER_STEP * 1.3);
  }

  // 3. 은은한 아르페지오 반주 (Sine: 부드러운 화음 텍스처)
  if (arpFreq > 0) {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(arpFreq, time);

    gain.gain.setValueAtTime(0.012, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + SECONDS_PER_STEP * 0.95);

    osc.connect(gain);
    gain.connect(bgmMasterGain);

    osc.start(time);
    osc.stop(time + SECONDS_PER_STEP * 0.95);
  }
}

function bgmScheduler() {
  if (!bgmRunning || isBGMMutedState || !audioCtx) return;
  while (bgmNextNoteTime < audioCtx.currentTime + SCHEDULE_AHEAD_TIME) {
    playStepNote(bgmCurrentStep, bgmNextNoteTime);
    bgmNextNoteTime += SECONDS_PER_STEP;
    bgmCurrentStep = (bgmCurrentStep + 1) % MELODY_SEQUENCE.length;
  }
}

export function startBGM() {
  if (isBGMMutedState || bgmRunning) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  // 오디오 컨텍스트가 suspended 상태인 경우 포기하지 않고 즉시 resume 후 연주 개시
  if (ctx.state !== 'running') {
    ctx.resume().then(() => {
      if (!isBGMMutedState && !bgmRunning) {
        startBGM();
      }
    }).catch(() => {});
    return;
  }

  try {
    const now = ctx.currentTime;

    // 마스터 BGM 게인 (0.55 수준의 편안한 청취 레벨)
    // 클릭 팝 방지를 위한 0.05초 초고속 페이드인으로 딜레이 없이 첫 음부터 즉각 선명하게 연주
    bgmMasterGain = ctx.createGain();
    bgmMasterGain.gain.setValueAtTime(0.001, now);
    bgmMasterGain.gain.linearRampToValueAtTime(0.55, now + 0.05);
    bgmMasterGain.connect(ctx.destination);

    bgmPadVoices = [null, null, null];

    // 신스 패드 전용 마스터 게인
    bgmPadMasterGain = ctx.createGain();
    bgmPadMasterGain.gain.setValueAtTime(0.001, now);
    bgmPadMasterGain.gain.linearRampToValueAtTime(1.0, now + 0.05);
    bgmPadMasterGain.connect(bgmMasterGain);

    // --- 🎵 멜로디 및 앰비언트 패드 시퀀서 시작 ---
    bgmCurrentStep = 0;
    bgmNextNoteTime = now;
    bgmRunning = true;

    // 0ms 즉시 스케줄링: 인터벌을 기다리지 않고 첫 음표들을 즉각 큐에 삽입
    bgmScheduler();
    bgmIntervalId = setInterval(bgmScheduler, LOOKAHEAD_MS);
  } catch (_) {
    bgmRunning = false;
  }
}

export function stopBGM() {
  if (!bgmRunning) return;
  bgmRunning = false;

  if (bgmIntervalId) {
    clearInterval(bgmIntervalId);
    bgmIntervalId = null;
  }

  // 활성화된 앰비언트 패드 보이스 정지 및 정리
  bgmPadVoices.forEach((voice) => {
    if (voice) {
      try {
        voice.osc.stop();
        voice.osc.disconnect();
        voice.gain.disconnect();
      } catch (_) {}
    }
  });
  bgmPadVoices = [null, null, null];

  if (bgmPadMasterGain) {
    try { bgmPadMasterGain.disconnect(); } catch (_) {}
    bgmPadMasterGain = null;
  }

  if (bgmMasterGain && audioCtx) {
    try {
      const now = audioCtx.currentTime;
      bgmMasterGain.gain.setValueAtTime(bgmMasterGain.gain.value, now);
      bgmMasterGain.gain.linearRampToValueAtTime(0.001, now + 0.25);
      setTimeout(() => {
        if (bgmMasterGain) {
          try { bgmMasterGain.disconnect(); } catch (_) {}
          bgmMasterGain = null;
        }
      }, 300);
    } catch (_) {}
  }
}

// ==========================================
// 💥 인게임 효과음 (SFX)
// ==========================================

/**
 * 1. 로봇 선택음: 맑고 정교한 하이테크 피프 (850Hz -> 1300Hz 짧은 비프)
 */
export function playRobotSelect() {
  if (isSFXMutedState) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  unlockAudio();

  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = 'sine';
  osc.frequency.setValueAtTime(850, now);
  osc.frequency.exponentialRampToValueAtTime(1300, now + 0.05);

  gain.gain.setValueAtTime(0.08, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start(now);
  osc.stop(now + 0.05);
}

/**
 * 2. 미끄러짐 추진음: 부스터 공기압 + 유압 마찰 스위시 ("슉-")
 */
export function playSlide() {
  if (isSFXMutedState) return;
  const ctx = getAudioContext();
  if (!ctx || !noiseBuffer) return;
  unlockAudio();

  const now = ctx.currentTime;
  const dur = 0.09;

  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer;

  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.setValueAtTime(1600, now);
  filter.frequency.exponentialRampToValueAtTime(400, now + dur);
  filter.Q.setValueAtTime(3, now);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.12, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + dur);

  src.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);

  src.start(now);
  src.stop(now + dur);
}

/**
 * 3. 단단한 외벽 충돌음: 지반으로 충격이 전달되는 묵직한 콘크리트 충돌 ("쿵-")
 */
export function playWallHit() {
  if (isSFXMutedState) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  unlockAudio();

  const now = ctx.currentTime;
  const dur = 0.12;

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = 'triangle';
  osc.frequency.setValueAtTime(160, now);
  osc.frequency.exponentialRampToValueAtTime(45, now + dur);

  gain.gain.setValueAtTime(0.22, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + dur);

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start(now);
  osc.stop(now + dur);
}

/**
 * 4. 동료 로봇 충돌 완충음: 유압식 충격 흡수 장치 작동 ("슈욱- 찰칵!")
 */
export function playRobotBufferHit() {
  if (isSFXMutedState) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  unlockAudio();

  const now = ctx.currentTime;

  // 유압 흡수 밸브 사운드
  const osc1 = ctx.createOscillator();
  const gain1 = ctx.createGain();
  osc1.type = 'sine';
  osc1.frequency.setValueAtTime(320, now);
  osc1.frequency.exponentialRampToValueAtTime(700, now + 0.08);
  gain1.gain.setValueAtTime(0.12, now);
  gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
  osc1.connect(gain1);
  gain1.connect(ctx.destination);
  osc1.start(now);
  osc1.stop(now + 0.08);

  // 메탈릭 락킹 (C5 523Hz + E5 659Hz)
  const osc2 = ctx.createOscillator();
  const osc3 = ctx.createOscillator();
  const gain2 = ctx.createGain();

  osc2.type = 'triangle';
  osc3.type = 'triangle';
  osc2.frequency.setValueAtTime(523.25, now + 0.02);
  osc3.frequency.setValueAtTime(659.25, now + 0.02);

  gain2.gain.setValueAtTime(0.15, now + 0.02);
  gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

  osc2.connect(gain2);
  osc3.connect(gain2);
  gain2.connect(ctx.destination);

  osc2.start(now + 0.02);
  osc3.start(now + 0.02);
  osc2.stop(now + 0.12);
  osc3.stop(now + 0.12);
}

/**
 * 5. 실행 취소 (Undo) / 리셋: 유압 밸브 되감기 사운드
 */
export function playUndo() {
  if (isSFXMutedState) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  unlockAudio();

  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = 'sine';
  osc.frequency.setValueAtTime(420, now);
  osc.frequency.exponentialRampToValueAtTime(200, now + 0.06);

  gain.gain.setValueAtTime(0.09, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start(now);
  osc.stop(now + 0.06);
}

/**
 * 6. 클리어 성공 팡파르: 4화음 메이저 아르페지오 (C5 -> E5 -> G5 -> C6)
 */
export function playClear() {
  if (isSFXMutedState) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  unlockAudio();

  const now = ctx.currentTime;
  const notes = [523.25, 659.25, 783.99, 1046.5];
  const noteDuration = 0.09;

  notes.forEach((freq, idx) => {
    const noteStart = now + idx * 0.08;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, noteStart);

    const isLast = idx === notes.length - 1;
    const holdTime = isLast ? 0.35 : noteDuration;

    gain.gain.setValueAtTime(0.18, noteStart);
    gain.gain.exponentialRampToValueAtTime(0.001, noteStart + holdTime);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(noteStart);
    osc.stop(noteStart + holdTime);
  });
}

/**
 * 7. 일반 버튼 클릭 탭음
 */
export function playButtonClick() {
  if (isSFXMutedState) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  unlockAudio();

  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = 'sine';
  osc.frequency.setValueAtTime(1000, now);
  osc.frequency.exponentialRampToValueAtTime(500, now + 0.025);

  gain.gain.setValueAtTime(0.05, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.025);

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start(now);
  osc.stop(now + 0.025);
}
