/**
 * @file audio.js
 * @description Web Audio API 기반 순수 신디사이저 사운드 엔진 (무중단, 0KB 애셋, 초경량)
 *              무너지는 지하 폐기장 세계관을 반영한 유압식 슬라이딩 및 완충 흡수 효과음
 */

const STORAGE_KEY_MUTED = 'sr_sfx_muted';

let audioCtx = null;
let noiseBuffer = null;
let isMutedState = false;

// BGM 신디사이저 엔진 상태
let bgmRunning = false;
let bgmMasterGain = null;
let bgmNodes = [];
let bgmPulseTimer = null;

// 로컬 스토리지에서 음소거 설정 복원
try {
  if (typeof window !== 'undefined' && window.localStorage) {
    isMutedState = window.localStorage.getItem(STORAGE_KEY_MUTED) === '1';
  }
} catch (_) {}

/**
 * Web Audio API 컨텍스트 싱글톤 반환 및 노이즈 버퍼 초기화
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

/**
 * 미끄러짐/타격 사운드 합성에 쓰일 0.2초 화이트 노이즈 버퍼 캐싱
 */
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
 * 모바일(iOS Safari/카카오 인앱) 오디오 자동재생 제한 해제 및 BGM 자동 시작
 */
export function unlockAudio() {
  const ctx = getAudioContext();
  if (ctx) {
    if (ctx.state === 'suspended') {
      ctx.resume().then(() => {
        if (!isMutedState && !bgmRunning) {
          startBGM();
        }
      }).catch(() => {});
    } else if (ctx.state === 'running' && !isMutedState && !bgmRunning) {
      startBGM();
    }
  }
}

/**
 * 음소거 여부 확인
 * @returns {boolean}
 */
export function isMuted() {
  return isMutedState;
}

/**
 * 음소거 상태 토글 (SFX + BGM 동시 제어)
 * @returns {boolean} 변경된 음소거 상태
 */
export function toggleMute() {
  isMutedState = !isMutedState;
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(STORAGE_KEY_MUTED, isMutedState ? '1' : '0');
    }
  } catch (_) {}

  if (isMutedState) {
    stopBGM(0.4);
  } else {
    startBGM();
  }

  return isMutedState;
}

/**
 * 절차적 사이버펑크 앰비언트 BGM 시작
 * - 지하 폐기장의 붕괴 진동과 유압 제어 긴장감을 자아내는 0KB 실시간 신디사이저 루프
 */
export function startBGM() {
  if (isMutedState || bgmRunning) return;
  const ctx = getAudioContext();
  if (!ctx || ctx.state !== 'running') return;

  try {
    const now = ctx.currentTime;

    // 마스터 BGM 게인 (1.5초 부드러운 페이드인)
    bgmMasterGain = ctx.createGain();
    bgmMasterGain.gain.setValueAtTime(0.001, now);
    bgmMasterGain.gain.linearRampToValueAtTime(0.045, now + 1.5);
    bgmMasterGain.connect(ctx.destination);

    bgmNodes = [];

    // --- 레이어 1: 딥 서브 베이스 드론 (Deep Sub-Bass Drone 43.65Hz) ---
    const oscDrone1 = ctx.createOscillator();
    const oscDrone2 = ctx.createOscillator();
    const filterDrone = ctx.createBiquadFilter();
    const gainDrone = ctx.createGain();

    oscDrone1.type = 'triangle';
    oscDrone1.frequency.setValueAtTime(43.65, now); // F1
    oscDrone2.type = 'sine';
    oscDrone2.frequency.setValueAtTime(87.3, now); // F2 (옥타브 배음)

    filterDrone.type = 'lowpass';
    filterDrone.frequency.setValueAtTime(120, now);

    gainDrone.gain.setValueAtTime(0.35, now);

    oscDrone1.connect(filterDrone);
    oscDrone2.connect(filterDrone);
    filterDrone.connect(gainDrone);
    gainDrone.connect(bgmMasterGain);

    oscDrone1.start(now);
    oscDrone2.start(now);
    bgmNodes.push(oscDrone1, oscDrone2, filterDrone, gainDrone);

    // --- 레이어 2: 숨쉬는 아날로그 신스 패드 (Breathing Synth Pad with LFO) ---
    const padFreqs = [174.61, 261.63, 349.23]; // F3, C4, F4 (F minor chord tones)
    const filterPad = ctx.createBiquadFilter();
    filterPad.type = 'lowpass';
    filterPad.frequency.setValueAtTime(550, now);
    filterPad.Q.setValueAtTime(2.5, now);

    // LFO: 0.08Hz (약 12.5초 주기) 필터 스윕으로 서서히 호흡하는 앰비언스 생성
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.type = 'sine';
    lfo.frequency.setValueAtTime(0.08, now);
    lfoGain.gain.setValueAtTime(260, now); // 550Hz ± 260Hz 스윕 (290Hz ~ 810Hz)
    lfo.connect(lfoGain);
    lfoGain.connect(filterPad.frequency);
    lfo.start(now);
    bgmNodes.push(lfo, lfoGain);

    const gainPad = ctx.createGain();
    gainPad.gain.setValueAtTime(0.18, now);
    filterPad.connect(gainPad);
    gainPad.connect(bgmMasterGain);
    bgmNodes.push(filterPad, gainPad);

    padFreqs.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      osc.type = idx % 2 === 0 ? 'sine' : 'triangle';
      osc.frequency.setValueAtTime(freq, now);
      // 아날로그 신스 코러스 효과를 위한 미세 디튠
      osc.detune.setValueAtTime((idx - 1) * 6, now);
      osc.connect(filterPad);
      osc.start(now);
      bgmNodes.push(osc);
    });

    // --- 레이어 3: 미니멀 심장박동/지반 유압 펄스 (1.6초 주기) ---
    const playPulse = () => {
      if (!bgmRunning || isMutedState || !audioCtx || audioCtx.state !== 'running') return;
      try {
        const pNow = audioCtx.currentTime;
        const pOsc = audioCtx.createOscillator();
        const pGain = audioCtx.createGain();

        pOsc.type = 'triangle';
        pOsc.frequency.setValueAtTime(75, pNow);
        pOsc.frequency.exponentialRampToValueAtTime(28, pNow + 0.16);

        pGain.gain.setValueAtTime(0.18, pNow);
        pGain.gain.exponentialRampToValueAtTime(0.001, pNow + 0.16);

        pOsc.connect(pGain);
        pGain.connect(bgmMasterGain);

        pOsc.start(pNow);
        pOsc.stop(pNow + 0.16);
      } catch (_) {}
    };

    bgmPulseTimer = setInterval(playPulse, 1600);
    bgmRunning = true;
  } catch (_) {
    bgmRunning = false;
  }
}

/**
 * BGM 정지 (페이드아웃 지원)
 * @param {number} [fadeTime=0.4] 페이드아웃 지속 시간 (초)
 */
export function stopBGM(fadeTime = 0.4) {
  if (!bgmRunning) return;
  bgmRunning = false;

  if (bgmPulseTimer) {
    clearInterval(bgmPulseTimer);
    bgmPulseTimer = null;
  }

  if (bgmMasterGain && audioCtx) {
    try {
      const now = audioCtx.currentTime;
      bgmMasterGain.gain.setValueAtTime(bgmMasterGain.gain.value, now);
      bgmMasterGain.gain.linearRampToValueAtTime(0.001, now + fadeTime);
      setTimeout(() => {
        bgmNodes.forEach((node) => {
          try {
            if (node.stop) node.stop();
            if (node.disconnect) node.disconnect();
          } catch (_) {}
        });
        bgmNodes = [];
        if (bgmMasterGain) {
          try { bgmMasterGain.disconnect(); } catch (_) {}
          bgmMasterGain = null;
        }
      }, fadeTime * 1000 + 50);
    } catch (_) {}
  }
}

/**
 * 1. 로봇 선택음: 맑고 정교한 하이테크 피프 (850Hz -> 1300Hz 짧은 비프)
 */
export function playRobotSelect() {
  if (isMutedState) return;
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
  if (isMutedState) return;
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
  if (isMutedState) return;
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
 *    지반 충격을 완벽히 분산시키는 경쾌하고 안정적인 메탈릭 락킹 사운드
 */
export function playRobotBufferHit() {
  if (isMutedState) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  unlockAudio();

  const now = ctx.currentTime;

  // 1) 유압 흡수 밸브 릴리즈 사운드 (0.08s)
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

  // 2) 안정적인 2화음 메탈릭 락킹 (C5 523Hz + E5 659Hz)
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
  if (isMutedState) return;
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
  if (isMutedState) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  unlockAudio();

  const now = ctx.currentTime;
  const notes = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6
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
  if (isMutedState) return;
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

