import * as THREE from 'three';
import * as YUKA from 'yuka';
import { createIcons, icons } from 'lucide';

const canvas = document.querySelector('#city-canvas');
const citizenCount = document.querySelector('#citizen-count');
const districtName = document.querySelector('#district-name');
const shuffleButton = document.querySelector('#shuffle-npcs');
const motionButton = document.querySelector('#toggle-motion');
const motionIcon = motionButton.querySelector('i');
const playerSelect = document.querySelector('#player-select');
const populationSizeInput = document.querySelector('#population-size');
const playerAutoModeInput = document.querySelector('#player-auto-mode');
const nearbyNpcLabel = document.querySelector('#nearby-npc');
const npcVoiceLabel = document.querySelector('#npc-voice');
const traitsEl = document.querySelector('#npc-traits');
const chatLog = document.querySelector('#chat-log');
const chatForm = document.querySelector('#chat-form');
const chatInput = document.querySelector('#chat-input');
const apiKeyInput = document.querySelector('#openai-key');
const elevenLabsKeyInput = document.querySelector('#elevenlabs-key');
const voiceModeInput = document.querySelector('#voice-mode');
const elevenLabsVoiceIdInput = document.querySelector('#elevenlabs-voice-id');
const elevenLabsModelSelect = document.querySelector('#elevenlabs-model-select');
const voiceVarietySelect = document.querySelector('#voice-variety-select');
const modelSelect = document.querySelector('#model-select');
const conversationTopicSelect = document.querySelector('#conversation-topic');
const marketTopicSelect = document.querySelector('#market-topic-select');
const resetNewsCycleButton = document.querySelector('#reset-news-cycle');
const chatPanel = document.querySelector('#chat-panel');
const toggleChatPanel = document.querySelector('#toggle-chat-panel');
const closeChatPanel = document.querySelector('#close-chat-panel');
const toggleHudPanels = document.querySelector('#toggle-hud-panels');
const cityShell = document.querySelector('.city-shell');
const openAiApiKeyFromEnv = import.meta.env.VITE_OPENAI_API_KEY || '';
const elevenLabsApiKeyFromEnv = import.meta.env.VITE_ELEVENLABS_API_KEY || '';

const contract = '0xA2a6063B910fC7A7a286196F6c9b62B2797fa0Ae';
const districts = ['Market Row', 'Signal Yard', 'Mint Plaza', 'Arcade Block'];
const defaultNpcIds = [1, 7, 12, 33, 58, 91, 144, 212, 377, 508, 770, 888, 1003, 1414, 2024, 3131, 4096, 5150, 6400, 7777, 8080, 8990, 9670, 10000];
const npcBasePath = '/ethereum-nft-art-downloader/downloads-bg-removed';
const metadataBasePath = '/ethereum-nft-art-downloader/downloads';
const bgRemovedNpcMinId = 1;
const bgRemovedNpcMaxId = 10000;
const mapLimit = 220;
const mapSize = mapLimit * 2 + 20;
const roadPositions = [-180, -108, -36, 36, 108, 180];
const blockCenters = [-216, -144, -72, 0, 72, 144, 216];
const roadWidth = 12;
const sidewalkWidth = 5;
const trafficLaneOffset = roadWidth * 0.22;
const crosswalkOffset = roadWidth * 0.5 + 2.2;
const pedestrianPaths = [];
const interactionDistance = 8.5;
const collisionTalkDistance = 6.2;
const conversationDistance = 14;
const farewellDistance = 15;
const conversationBeatIntervalMs = 9000;
const prefetchedConversationBeatIntervalMs = 900;
const maxConversationParticipants = 8;
const maxDialogueLines = 8;
const npcPersonalSpace = 2.85;
const npcCrowdPersonalSpace = 3.35;
const crowdAnchorRadius = 5.25;
const crowdAnchorForce = 4.8;
const crowdSeparationForce = 8.2;
const crowdRelaxationSteps = 2;
const audioTurnGapMs = 180;
const conversationLeaveCooldownMs = 24000;
const maxDeparturesPerBeat = 2;
const marketTopicRefreshIntervalMs = 5 * 60 * 1000;
const interactionDistanceSq = interactionDistance * interactionDistance;
const collisionTalkDistanceSq = collisionTalkDistance * collisionTalkDistance;
const conversationDistanceSq = conversationDistance * conversationDistance;
const farewellDistanceSq = farewellDistance * farewellDistance;
const npcPersonalSpaceSq = npcPersonalSpace * npcPersonalSpace;
const npcCrowdPersonalSpaceSq = npcCrowdPersonalSpace * npcCrowdPersonalSpace;
const playerSpeed = 18;
const minCitizensLoaded = 0;
const maxCitizensLoaded = 159;
const defaultCitizensLoaded = defaultNpcIds.length - 1;
const defaultPopulationSize = defaultCitizensLoaded + 1;

let paused = false;
let districtIndex = 0;
let playerId = defaultNpcIds[0];
let playerSprite;
let nearestNpc = null;
let activeNpcId = null;
let activeConversationKey = null;
let activeParticipantIds = [];
let pendingParticipantIds = [];
let npcIds = [...defaultNpcIds];
let populationSize = defaultPopulationSize;
let conversationInFlight = false;
let conversationInFlightKey = null;
let conversationRunId = 0;
let prefetchedConversationKey = null;
let prefetchedConversationPromise = null;
let prefetchedConversationReply = null;
let nextConversationBeatAt = 0;
let lastPlayerAutoLineAt = 0;
let pointerDown = false;
let pointerStart = { x: 0, y: 0 };
let orbitYaw = 0;
let orbitPitch = 0;
let cameraRadius = 43;
let activeNpcAudio = null;
let activeNpcAudioUrl = null;
let activeNpcAudioSettle = null;
let audioContext = null;
let audioPlaybackUnlocked = false;
let voicePlaybackQueue = Promise.resolve();
let talkingUntil = 0;
let marketTopics = [];
let marketPriceContext = '';
let marketTopicLastLoadedAt = 0;
let activeConversationFormationAngle = 0;

const keyState = new Map();
const conversations = new Map();
const metadataCache = new Map();
const npcVoiceAssignments = new Map();
const npcRuntimeNames = new Map();
const conversationMixProfileCache = new Map();
const conversationLeaveCooldowns = new Map();
const conversationTopicMemory = new Map();
const npcDialogueMemory = new Map();
const cityDialogueMemory = [];
const bgRemovedValidIds = defaultNpcIds.filter(Number.isInteger);
const bgRemovedValidIdSet = new Set(bgRemovedValidIds);
const activeSpeakerIds = new Set();
const activeSpeechBubbles = new Map();
const movementKeys = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight']);
const conversationTopicPrompts = {
  street: 'Topic mode: casual street banter. Keep it grounded in the moment and their traits.',
  roasting: 'Topic mode: playful roasting. Characters lightly roast each other with witty, non-hateful jokes; avoid slurs or protected-class insults.',
  arguing: 'Topic mode: arguing. Characters disagree sharply but stay funny and non-threatening.',
  politics: 'Topic mode: politics. Characters debate local city rules, civic gossip, campaigns, and policy-like drama without endorsing real-world parties or making factual political claims.',
  'social-media': 'Topic mode: social media banter. Characters talk like they are reacting to posts, trends, clout, feeds, replies, screenshots, and going viral.',
  'brain-rot': 'Topic mode: brain rot. Characters use chaotic internet slang, absurd callbacks, and meme-like phrasing while staying understandable.'
};
const conversationAttitudePrompts = {
  playful: 'Attitude: playful and quick-witted.',
  tense: 'Attitude: tense, suspicious, and argumentative without threats.',
  chaotic: 'Attitude: chaotic, fast, and absurd, but still understandable.',
  sincere: 'Attitude: sincere, curious, and emotionally direct.',
  smug: 'Attitude: smug, competitive, and self-important.',
  paranoid: 'Attitude: paranoid, rumor-driven, and conspiratorial in a fictional city-gossip way.',
  deadpan: 'Attitude: deadpan, dry, and understated.'
};
const allowedMixTopics = ['street', 'roasting', 'arguing', 'politics', 'social-media', 'brain-rot'];
const allowedMixAttitudes = ['playful', 'tense', 'chaotic', 'sincere', 'smug', 'paranoid', 'deadpan'];
const voiceVarietyProfiles = {
  focused: {
    poolSize: 3,
    usagePenalty: 1.8,
    scoreNoise: 1.2,
    stability: [0.5, 0.68],
    similarity: [0.74, 0.86],
    style: [0.08, 0.24]
  },
  varied: {
    poolSize: 10,
    usagePenalty: 3.4,
    scoreNoise: 3.2,
    stability: [0.36, 0.64],
    similarity: [0.58, 0.82],
    style: [0.22, 0.56]
  },
  wild: {
    poolSize: 18,
    usagePenalty: 5.2,
    scoreNoise: 5.4,
    stability: [0.26, 0.7],
    similarity: [0.45, 0.76],
    style: [0.38, 0.86]
  }
};
const marketFeeds = [
  { name: 'Crypto - CoinDesk', url: 'https://www.coindesk.com/arc/outboundfeeds/rss/' },
  { name: 'Crypto - Cointelegraph', url: 'https://cointelegraph.com/rss' },
  { name: 'Markets - Yahoo Finance', url: 'https://finance.yahoo.com/news/rssindex' },
  { name: 'Markets - CNBC', url: 'https://www.cnbc.com/id/100003114/device/rss/rss.html' },
  { name: 'Gossip - TMZ', url: 'https://www.tmz.com/rss.xml' },
  { name: 'Gossip - Page Six', url: 'https://pagesix.com/feed/' },
  { name: 'Gossip - E! News', url: 'https://www.eonline.com/syndication/feeds/rssfeeds/topstories.xml' },
  { name: 'Entertainment - ET', url: 'https://www.etonline.com/news/rss' },
  { name: 'Entertainment - Variety', url: 'https://variety.com/feed/' },
  { name: 'Entertainment - Hollywood Reporter', url: 'https://www.hollywoodreporter.com/feed/' },
  { name: 'Entertainment - Google News', url: 'https://news.google.com/rss/headlines/section/topic/ENTERTAINMENT?hl=en-US&gl=US&ceid=US:en' },
  { name: 'Gossip - Google News', url: 'https://news.google.com/rss/search?q=TMZ+celebrity+gossip&hl=en-US&gl=US&ceid=US:en' },
  { name: 'Politics - Politico', url: 'https://rss.politico.com/politics-news.xml' },
  { name: 'Politics - Google News', url: 'https://news.google.com/rss/headlines/section/topic/NATION?hl=en-US&gl=US&ceid=US:en' }
];

const fallbackVoices = [
  { voice_id: 'JBFqnCBsd6RMkjVDRZzb', name: 'George', labels: { gender: 'male', age: 'middle-aged', description: 'warm', accent: 'British' } },
  { voice_id: '21m00Tcm4TlvDq8ikWAM', name: 'Rachel', labels: { gender: 'female', age: 'middle-aged', description: 'calm', accent: 'American' } },
  { voice_id: 'pNInz6obpgDQGcFmaJgB', name: 'Adam', labels: { gender: 'male', age: 'middle-aged', description: 'deep', accent: 'American' } },
  { voice_id: 'EXAVITQu4vr4xnSDxMaL', name: 'Bella', labels: { gender: 'female', age: 'young', description: 'soft', accent: 'American' } },
  { voice_id: 'ErXwobaYiN019PkySvjV', name: 'Antoni', labels: { gender: 'male', age: 'young', description: 'well-rounded', accent: 'American' } },
  { voice_id: 'MF3mGyEYCl7XYWbV9V6O', name: 'Elli', labels: { gender: 'female', age: 'young', description: 'emotional', accent: 'American' } },
  { voice_id: 'VR6AewLTigWG4xSOukaG', name: 'Arnold', labels: { gender: 'male', age: 'middle-aged', description: 'crisp', accent: 'American' } },
  { voice_id: 'yoZ06aMxZJJ28mfd3POQ', name: 'Sam', labels: { gender: 'male', age: 'young', description: 'raspy', accent: 'American' } }
];
let elevenLabsVoiceListPromise = null;
let elevenLabsVoiceListKey = '';

const givenNames = [
  'Mara', 'Juno', 'Ren', 'Sol', 'Vera', 'Niko', 'Tess', 'Ira',
  'Bram', 'Noa', 'Cyra', 'Oren', 'Vale', 'Mika', 'Rook', 'Zia',
  'Kade', 'Lena', 'Ash', 'Pax', 'Milo', 'Sena', 'Taro', 'Nyx'
];
const handleNames = [
  'Patch', 'Signal', 'Mint', 'Glitch', 'Courier', 'Arcade', 'Ledger', 'Static',
  'Cinder', 'Pixel', 'North', 'Loop', 'Beacon', 'Drift', 'Slate', 'Echo',
  'Morrow', 'Wire', 'Index', 'Dash', 'Orbit', 'Kernel', 'Relay', 'Pylon'
];
const playerAutoLines = [
  'Hold up, what did I just walk into?',
  'You two always talk this fast?',
  'That sounds like trouble. Small trouble, or city trouble?',
  'I was passing through, but now I need context.',
  'Someone explain before the cars start judging us.',
  'I have opinions, but I am collecting evidence first.',
  'That outfit says you know more than you are saying.',
  'Okay, I am listening. Make it interesting.'
];

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1b1f1d);
scene.fog = new THREE.FogExp2(0x1b1f1d, 0.014);

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: false,
  alpha: false,
  preserveDrawingBuffer: false,
  powerPreference: 'high-performance'
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.25));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = false;

const camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.1, 420);
camera.position.set(0, 18, 46);

const clock = new THREE.Clock();
const city = new THREE.Group();
const citizens = new THREE.Group();
const traffic = new THREE.Group();
const proximityRanges = new THREE.Group();
const player = new THREE.Group();
scene.add(city, citizens, traffic, proximityRanges, player);

const steeringEntities = new YUKA.EntityManager();
const textureLoader = new THREE.TextureLoader();
const textureCache = new Map();
const npcGeometry = new THREE.PlaneGeometry(1, 1);
const talkRingGeometry = new THREE.RingGeometry(0.55, 0.62, 48);
const conversationRangeGeometry = new THREE.RingGeometry(conversationDistance - 0.12, conversationDistance + 0.12, 96);
const collisionRangeGeometry = new THREE.RingGeometry(collisionTalkDistance - 0.1, collisionTalkDistance + 0.1, 72);
const citizenRangeMaterial = new THREE.MeshBasicMaterial({
  color: 0xf2b75b,
  transparent: true,
  opacity: 0.14,
  depthWrite: false,
  side: THREE.DoubleSide
});
citizenRangeMaterial.userData.shared = true;
const playerRangeMaterial = new THREE.MeshBasicMaterial({
  color: 0x70d4d0,
  transparent: true,
  opacity: 0.18,
  depthWrite: false,
  side: THREE.DoubleSide
});
playerRangeMaterial.userData.shared = true;
const moveTarget = new THREE.Vector3();
const nextPlayerPosition = new THREE.Vector3();
const projectionPosition = new THREE.Vector3();
const crowdAnchor = new THREE.Vector3();
const crowdDelta = new THREE.Vector3();
const speechLayer = document.createElement('div');
speechLayer.className = 'speech-layer';
speechLayer.setAttribute('aria-hidden', 'true');
cityShell.append(speechLayer);

function npcPath(id) {
  return `${npcBasePath}/${contract}-${id}.bg-removed.png`;
}

function metadataPath(id) {
  return `${metadataBasePath}/${contract}-${id}.metadata.json`;
}

function hasBgRemovedNpcAsset(id) {
  return Number.isInteger(id)
    && id >= bgRemovedNpcMinId
    && id <= bgRemovedNpcMaxId
    && bgRemovedValidIdSet.has(id);
}

function normalizeBgRemovedNpcId(value) {
  const numericValue = Math.floor(Number(value) || bgRemovedNpcMinId);
  let bestIndex = 0;
  let bestDistance = Infinity;
  bgRemovedValidIds.forEach((id, index) => {
    const distance = Math.abs(id - numericValue);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  });
  return bgRemovedValidIds[bestIndex] || defaultNpcIds.find((id) => bgRemovedValidIdSet.has(id)) || bgRemovedNpcMinId;
}

function makeMaterial(color, roughness = 0.78, metalness = 0.08) {
  return new THREE.MeshLambertMaterial({ color });
}

function freezeStaticGroup(group) {
  group.updateMatrixWorld(true);
  group.traverse((object) => {
    object.matrixAutoUpdate = false;
  });
}

function addLights() {
  const hemi = new THREE.HemisphereLight(0xffecd0, 0x36423a, 2.4);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xffd6a0, 2.6);
  sun.position.set(-18, 32, 24);
  scene.add(sun);

  const plazaLight = new THREE.PointLight(0xf2b75b, 3.2, 34, 1.2);
  plazaLight.position.set(0, 9, 2);
  scene.add(plazaLight);
}

function addSegmentedStrip({ axis, fixed, width, y, material, skipHalfWidth }) {
  const sortedRoads = [...roadPositions].sort((a, b) => a - b);
  let segmentStart = -mapLimit;

  sortedRoads.forEach((road) => {
    const segmentEnd = road - skipHalfWidth;
    if (segmentEnd > segmentStart) {
      const length = segmentEnd - segmentStart;
      const strip = axis === 'z'
        ? new THREE.Mesh(new THREE.BoxGeometry(width, 0.12, length), material)
        : new THREE.Mesh(new THREE.BoxGeometry(length, 0.12, width), material);
      strip.position.set(
        axis === 'z' ? fixed : segmentStart + length * 0.5,
        y,
        axis === 'z' ? segmentStart + length * 0.5 : fixed
      );
      city.add(strip);
    }

    segmentStart = road + skipHalfWidth;
  });

  if (segmentStart < mapLimit) {
    const length = mapLimit - segmentStart;
    const strip = axis === 'z'
      ? new THREE.Mesh(new THREE.BoxGeometry(width, 0.12, length), material)
      : new THREE.Mesh(new THREE.BoxGeometry(length, 0.12, width), material);
    strip.position.set(
      axis === 'z' ? fixed : segmentStart + length * 0.5,
      y,
      axis === 'z' ? segmentStart + length * 0.5 : fixed
    );
    city.add(strip);
  }
}

function addPedestrianPathSegments({ axis, fixed, skipHalfWidth }) {
  const sortedRoads = [...roadPositions].sort((a, b) => a - b);
  let segmentStart = -mapLimit;

  sortedRoads.forEach((road) => {
    const segmentEnd = road - skipHalfWidth;
    if (segmentEnd - segmentStart > 8) {
      pedestrianPaths.push({ axis, fixed, min: segmentStart, max: segmentEnd });
    }

    const crosswalkMin = road - skipHalfWidth;
    const crosswalkMax = road + skipHalfWidth;
    pedestrianPaths.push({ axis, fixed, min: crosswalkMin, max: crosswalkMax, crosswalk: true });
    segmentStart = road + skipHalfWidth;
  });

  if (mapLimit - segmentStart > 8) {
    pedestrianPaths.push({ axis, fixed, min: segmentStart, max: mapLimit });
  }
}

function addGround() {
  const laneMarkMaterial = new THREE.MeshBasicMaterial({ color: 0xe9d8a6 });
  const crosswalkMaterial = new THREE.MeshBasicMaterial({ color: 0xf4efe7 });
  const curbMaterial = new THREE.MeshLambertMaterial({ color: 0xb9b6a8 });
  const sidewalkMaterial = new THREE.MeshLambertMaterial({ color: 0x6f7269 });

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(mapSize, mapSize),
    new THREE.MeshLambertMaterial({ color: 0x243025 })
  );
  ground.rotation.x = -Math.PI / 2;
  city.add(ground);

  const roadMaterial = new THREE.MeshLambertMaterial({ color: 0x151716 });
  roadPositions.forEach((position) => {
    const verticalRoad = new THREE.Mesh(new THREE.BoxGeometry(roadWidth, 0.08, mapSize), roadMaterial);
    verticalRoad.position.set(position, 0.05, 0);
    city.add(verticalRoad);

    const horizontalRoad = new THREE.Mesh(new THREE.BoxGeometry(mapSize, 0.08, roadWidth), roadMaterial);
    horizontalRoad.position.set(0, 0.06, position);
    city.add(horizontalRoad);

    [-1, 1].forEach((side) => {
      const curbV = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.24, mapSize), curbMaterial);
      curbV.position.set(position + side * roadWidth * 0.5, 0.2, 0);
      city.add(curbV);

      const curbH = new THREE.Mesh(new THREE.BoxGeometry(mapSize, 0.24, 0.28), curbMaterial);
      curbH.position.set(0, 0.21, position + side * roadWidth * 0.5);
      city.add(curbH);

      addSegmentedStrip({
        axis: 'z',
        fixed: position + side * (roadWidth * 0.5 + sidewalkWidth * 0.5),
        width: sidewalkWidth,
        y: 0.12,
        material: sidewalkMaterial,
        skipHalfWidth: crosswalkOffset
      });

      addSegmentedStrip({
        axis: 'x',
        fixed: position + side * (roadWidth * 0.5 + sidewalkWidth * 0.5),
        width: sidewalkWidth,
        y: 0.13,
        material: sidewalkMaterial,
        skipHalfWidth: crosswalkOffset
      });
    });
  });

  roadPositions.forEach((roadX) => {
    for (let z = -mapLimit; z <= mapLimit; z += 22) {
      const lane = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.1, 7.2), laneMarkMaterial);
      lane.position.set(roadX, 0.16, z);
      city.add(lane);
    }
  });

  roadPositions.forEach((roadZ) => {
    for (let x = -mapLimit; x <= mapLimit; x += 22) {
      if (roadPositions.some((roadX) => Math.abs(x - roadX) < roadWidth * 0.9)) continue;
      const lane = new THREE.Mesh(new THREE.BoxGeometry(7.2, 0.1, 0.26), laneMarkMaterial);
      lane.position.set(x, 0.17, roadZ);
      city.add(lane);
    }
  });

  roadPositions.forEach((x) => {
    roadPositions.forEach((z) => {
      const intersection = new THREE.Mesh(new THREE.BoxGeometry(roadWidth + 1.4, 0.16, roadWidth + 1.4), roadMaterial);
      intersection.position.set(x, 0.18, z);
      city.add(intersection);

      [-1, 1].forEach((sideZ) => {
        const crosswalkZ = z + sideZ * crosswalkOffset;
        const stopLine = new THREE.Mesh(new THREE.BoxGeometry(roadWidth + 1.6, 0.16, 0.34), crosswalkMaterial);
        stopLine.position.set(x, 0.28, crosswalkZ - sideZ * 2.15);
        city.add(stopLine);

        for (let stripe = -2; stripe <= 2; stripe += 1) {
          const stripeMesh = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.16, 3.2), crosswalkMaterial);
          stripeMesh.position.set(x + stripe * 1.75, 0.29, crosswalkZ);
          city.add(stripeMesh);
        }
      });

      [-1, 1].forEach((sideX) => {
        const crosswalkX = x + sideX * crosswalkOffset;
        const stopLine = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.16, roadWidth + 1.6), crosswalkMaterial);
        stopLine.position.set(crosswalkX - sideX * 2.15, 0.3, z);
        city.add(stopLine);

        for (let stripe = -2; stripe <= 2; stripe += 1) {
          const stripeMesh = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.16, 0.72), crosswalkMaterial);
          stripeMesh.position.set(crosswalkX, 0.31, z + stripe * 1.75);
          city.add(stripeMesh);
        }
      });
    });
  });

  blockCenters.forEach((x) => {
    blockCenters.forEach((z) => {
      if (Math.abs(x) < 42 && Math.abs(z) < 42) return;
      const lot = new THREE.Mesh(
        new THREE.BoxGeometry(42, 0.1, 42),
        new THREE.MeshLambertMaterial({ color: 0x2c362d })
      );
      lot.position.set(x, 0.11, z);
      city.add(lot);
    });
  });

  blockCenters.forEach((x) => {
    blockCenters.forEach((z) => {
      const lamp = new THREE.Mesh(
        new THREE.CylinderGeometry(0.12, 0.12, 3.8, 10),
        new THREE.MeshLambertMaterial({ color: 0x4d514b })
      );
      lamp.position.set(x + 11, 1.95, z + 11);
      city.add(lamp);

      const lampHead = new THREE.Mesh(
        new THREE.SphereGeometry(0.46, 12, 8),
        new THREE.MeshBasicMaterial({ color: 0xf2b75b })
      );
      lampHead.position.set(x + 11, 4.05, z + 11);
      city.add(lampHead);
    });
  });

  roadPositions.forEach((road) => {
    [-1, 1].forEach((side) => {
      addPedestrianPathSegments({
        axis: 'z',
        fixed: road + side * (roadWidth * 0.5 + sidewalkWidth * 0.5),
        skipHalfWidth: crosswalkOffset
      });
      addPedestrianPathSegments({
        axis: 'x',
        fixed: road + side * (roadWidth * 0.5 + sidewalkWidth * 0.5),
        skipHalfWidth: crosswalkOffset
      });
    });
  });

  const plaza = new THREE.Mesh(
    new THREE.CylinderGeometry(12, 12, 0.12, 72),
    new THREE.MeshLambertMaterial({
      color: 0x3a3326,
      emissive: 0x1c1307,
      emissiveIntensity: 0.7
    })
  );
  plaza.position.set(0, 0.16, 0);
  city.add(plaza);

  const plazaRing = new THREE.Mesh(
    new THREE.TorusGeometry(12, 0.08, 10, 96),
    new THREE.MeshBasicMaterial({ color: 0xf2b75b })
  );
  plazaRing.rotation.x = Math.PI / 2;
  plazaRing.position.set(0, 0.26, 0);
  city.add(plazaRing);
}

function addBuildings() {
  const palette = [0x47564c, 0x6e5f4a, 0x3f5961, 0x684b45, 0x536243, 0x56545d];
  const windowMaterial = new THREE.MeshBasicMaterial({ color: 0xf2b75b });
  const buildingCoords = blockCenters;

  buildingCoords.forEach((x, xi) => {
    buildingCoords.forEach((z, zi) => {
      if (Math.abs(x) < 42 && Math.abs(z) < 42) return;
      if ((xi + zi) % 3 === 0) return;

      const height = 10 + ((xi * xi + zi * zi + Math.abs(xi * zi)) % 18);
      const width = 20 + (xi % 3) * 3.4;
      const depth = 20 + (zi % 3) * 3.4;
      const building = new THREE.Mesh(
        new THREE.BoxGeometry(width, height, depth),
        makeMaterial(palette[Math.abs(xi + zi) % palette.length], 0.72, 0.12)
      );
      building.position.set(x, height / 2 + 0.16, z);
      city.add(building);

      for (let floor = 2; floor < height - 1; floor += 2.2) {
        const sign = new THREE.Mesh(new THREE.BoxGeometry(width * 0.72, 0.45, 0.08), windowMaterial);
        sign.position.set(x, floor, z + depth / 2 + 0.05);
        city.add(sign);
      }
    });
  });
}

function addTransit() {
  const carColors = [0xdc6b52, 0x70d4d0, 0xf2b75b, 0x74d38a];
  const trafficRoutes = [
    ...roadPositions.flatMap((z) => [
      { axis: 'x', fixed: z - trafficLaneOffset, direction: 1 },
      { axis: 'x', fixed: z + trafficLaneOffset, direction: -1 }
    ]),
    ...roadPositions.flatMap((x) => [
      { axis: 'z', fixed: x - trafficLaneOffset, direction: 1 },
      { axis: 'z', fixed: x + trafficLaneOffset, direction: -1 }
    ])
  ];

  for (let i = 0; i < 24; i += 1) {
    const route = trafficRoutes[i % trafficRoutes.length];
    const car = new THREE.Mesh(
      new THREE.BoxGeometry(2.8, 0.9, 1.35),
      new THREE.MeshLambertMaterial({ color: carColors[i % carColors.length] })
    );
    const travelStart = -mapLimit + ((i * 31) % (mapLimit * 2));
    if (route.axis === 'x') {
      car.position.set(travelStart, 0.65, route.fixed);
      car.rotation.y = route.direction > 0 ? 0 : Math.PI;
    } else {
      car.position.set(route.fixed, 0.65, travelStart);
      car.rotation.y = route.direction > 0 ? -Math.PI / 2 : Math.PI / 2;
    }

    car.userData.route = route;
    car.userData.speed = (7 + (i % 4) * 1.2) * route.direction;
    traffic.add(car);
  }
}

function addSkylineGlow() {
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(90, 32, 16),
    new THREE.MeshBasicMaterial({ color: 0x28302c, side: THREE.BackSide })
  );
  dome.position.y = 24;
  scene.add(dome);
}

function disposeGroupMaterials(group) {
  group.traverse((object) => {
    if (!object.material) return;
    if (Array.isArray(object.material)) {
      object.material.forEach((material) => {
        if (!material.userData.shared) material.dispose();
      });
      return;
    }

    if (!object.material.userData.shared) object.material.dispose();
  });
}

function getNpcTexture(id) {
  if (textureCache.has(id)) return textureCache.get(id);

  const texture = textureLoader.load(npcPath(id));
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 1;
  texture.generateMipmaps = false;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  textureCache.set(id, texture);
  return texture;
}

function pruneNpcTextureCache(activeIds) {
  textureCache.forEach((texture, id) => {
    if (activeIds.has(id)) return;
    texture.dispose();
    textureCache.delete(id);
  });
}

function createGroundRangeRing(geometry, material) {
  const ring = new THREE.Mesh(geometry, material);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.18;
  ring.renderOrder = 2;
  return ring;
}

function createNpcSprite(id, scale = 6.8) {
  const sprite = new THREE.Mesh(
    npcGeometry,
    new THREE.MeshBasicMaterial({
      map: getNpcTexture(id),
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide
    })
  );
  sprite.scale.setScalar(scale);
  sprite.userData.id = id;

  const talkRings = new THREE.Group();
  talkRings.name = 'talk-rings';
  talkRings.visible = false;
  [0, 1].forEach((index) => {
    const ring = new THREE.Mesh(
      talkRingGeometry,
      new THREE.MeshBasicMaterial({
        color: index === 0 ? 0x70d4d0 : 0xf2b75b,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        side: THREE.DoubleSide
      })
    );
    ring.renderOrder = 4;
    ring.userData.phase = index * 0.5;
    talkRings.add(ring);
  });
  sprite.add(talkRings);
  sprite.userData.talkRings = talkRings;

  return sprite;
}

function pointOnPedestrianPath(index, t = Math.random()) {
  const path = pedestrianPaths[index % pedestrianPaths.length];
  const value = path.min + (path.max - path.min) * t;
  return path.axis === 'z'
    ? new THREE.Vector3(path.fixed, 4.1, value)
    : new THREE.Vector3(value, 4.1, path.fixed);
}

function assignWalkTarget(sprite) {
  let pathIndex = Math.floor(Math.random() * pedestrianPaths.length);
  const currentPath = pedestrianPaths[sprite.userData.pathIndex];
  if (currentPath) {
    const connectedPaths = pedestrianPaths
      .map((path, index) => ({ path, index }))
      .filter(({ path }) => {
        return path.axis === currentPath.axis
          && Math.abs(path.fixed - currentPath.fixed) < 0.01
          && (Math.abs(path.min - currentPath.max) < 0.01 || Math.abs(path.max - currentPath.min) < 0.01);
      });
    if (connectedPaths.length > 0 && Math.random() < 0.72) {
      pathIndex = connectedPaths[Math.floor(Math.random() * connectedPaths.length)].index;
    }
  }

  sprite.userData.pathIndex = pathIndex;
  sprite.userData.target = pointOnPedestrianPath(pathIndex);
}

function clampPopulationSize(value) {
  const citizensLoaded = THREE.MathUtils.clamp(
    Math.round(Number(value) || defaultCitizensLoaded),
    minCitizensLoaded,
    maxCitizensLoaded
  );
  return citizensLoaded + 1;
}

function generateNpcIds(count = populationSize, start = 1) {
  const ids = [];
  const seen = new Set();
  let cursor = bgRemovedValidIds.indexOf(normalizeBgRemovedNpcId(start));
  if (cursor < 0) cursor = 0;
  let step = 37;

  while (ids.length < count) {
    const id = bgRemovedValidIds[((cursor % bgRemovedValidIds.length) + bgRemovedValidIds.length) % bgRemovedValidIds.length];
    if (hasBgRemovedNpcAsset(id) && !seen.has(id)) {
      ids.push(id);
      seen.add(id);
    }

    cursor += step;
    step = step === 37 ? 53 : 37;
  }

  return ids;
}

function rebuildPopulation({ keepPlayer = true, shuffle = false } = {}) {
  const start = shuffle
    ? bgRemovedValidIds[Math.floor(Math.random() * bgRemovedValidIds.length)]
    : playerId;
  const previousPlayerId = hasBgRemovedNpcAsset(playerId)
    ? playerId
    : bgRemovedValidIds[0] || defaultNpcIds.find((id) => bgRemovedValidIdSet.has(id)) || bgRemovedNpcMinId;
  npcIds = generateNpcIds(populationSize, start);

  if (keepPlayer && !npcIds.includes(previousPlayerId)) {
    npcIds[0] = previousPlayerId;
  }

  playerId = keepPlayer ? previousPlayerId : npcIds[0];
  addPlayer(playerId);
  addCitizens(npcIds);
  setActiveNpc(null);
}

function disposeCitizenSprite(sprite) {
  if (!sprite) return;
  if (sprite.userData.conversationRange) proximityRanges.remove(sprite.userData.conversationRange);
  if (sprite.userData.collisionRange) proximityRanges.remove(sprite.userData.collisionRange);
  if (sprite.userData.steering?.vehicle) steeringEntities.remove(sprite.userData.steering.vehicle);
  disposeGroupMaterials(sprite);
}

function populatePlayerSelect() {
  playerSelect.replaceChildren();
  npcIds.filter(hasBgRemovedNpcAsset).forEach((id) => {
    const option = document.createElement('option');
    option.value = String(id);
    option.textContent = `NPC #${id}`;
    playerSelect.append(option);
  });
  playerSelect.value = String(playerId);
}

function addPlayer(id = playerId) {
  disposeGroupMaterials(player);
  player.clear();
  playerId = hasBgRemovedNpcAsset(id) ? id : bgRemovedValidIds[0] || defaultNpcIds[0];
  playerSprite = createNpcSprite(playerId, 5.4);
  playerSprite.position.set(0, 3.4, 0);
  playerSprite.renderOrder = 10;
  player.add(playerSprite);

  const conversationRange = createGroundRangeRing(conversationRangeGeometry, playerRangeMaterial);
  conversationRange.name = 'player-conversation-range';
  player.add(conversationRange);

  const halo = new THREE.Mesh(
    new THREE.TorusGeometry(3.1, 0.08, 8, 64),
    new THREE.MeshBasicMaterial({ color: 0x70d4d0 })
  );
  halo.name = 'player-halo';
  halo.rotation.x = Math.PI / 2;
  halo.position.set(0, 0.34, 0);
  player.add(halo);
}

function createCitizenSprite(id, index, totalCount, position = null) {
  const sprite = createNpcSprite(id, 4.2);
  sprite.position.copy(position || pointOnPedestrianPath(index * 2 + 3, (index + 1) / Math.max(1, totalCount)));
  sprite.userData.floatOffset = index * 0.7;
  sprite.userData.speed = 3.2 + (index % 5) * 0.55;
  assignWalkTarget(sprite);

  const conversationRange = createGroundRangeRing(conversationRangeGeometry, citizenRangeMaterial);
  const collisionRange = createGroundRangeRing(collisionRangeGeometry, playerRangeMaterial);
  collisionRange.material = playerRangeMaterial;
  collisionRange.visible = false;
  sprite.userData.conversationRange = conversationRange;
  sprite.userData.collisionRange = collisionRange;
  proximityRanges.add(conversationRange, collisionRange);
  attachSteeringVehicle(sprite);

  return sprite;
}

function addCitizens(ids = npcIds, { resetPositions = false } = {}) {
  if (resetPositions) {
    citizens.children.slice().forEach(disposeCitizenSprite);
    citizens.clear();
    proximityRanges.clear();
  }

  const desiredCitizenIds = ids.filter((id) => hasBgRemovedNpcAsset(id) && id !== playerId);
  const desiredCitizenIdSet = new Set(desiredCitizenIds);
  const existingSprites = new Map(citizens.children.map((sprite) => [sprite.userData.id, sprite]));

  citizens.children.slice().forEach((sprite) => {
    if (desiredCitizenIdSet.has(sprite.userData.id) && !resetPositions) return;
    citizens.remove(sprite);
    disposeCitizenSprite(sprite);
  });

  desiredCitizenIds.forEach((id, index) => {
    if (!resetPositions && existingSprites.has(id)) {
      const sprite = existingSprites.get(id);
      sprite.userData.floatOffset = index * 0.7;
      sprite.userData.speed = 3.2 + (index % 5) * 0.55;
      return;
    }

    citizens.add(createCitizenSprite(id, index, desiredCitizenIds.length));
  });

  citizenCount.textContent = String(citizens.children.length);
  populatePlayerSelect();
  pruneNpcTextureCache(new Set([playerId, ...ids]));
}

async function reconcileActiveConversationAfterRosterChange(previousKey = activeConversationKey) {
  const availableIds = new Set([playerId, ...citizens.children.map((sprite) => sprite.userData.id)]);
  pendingParticipantIds = pendingParticipantIds.filter((id) => availableIds.has(id) && id !== playerId);

  if (!activeConversationKey) return;

  const nextIds = activeParticipantIds.filter((id) => availableIds.has(id));
  const nonPlayerIds = nextIds.filter((id) => id !== playerId);
  if (nonPlayerIds.length === 0) {
    conversationRunId += 1;
    activeNpcId = null;
    activeConversationKey = null;
    activeParticipantIds = [];
    pendingParticipantIds = [];
    stopActiveNpcAudio();
    stopTalkingIndicators();
    clearPrefetchedConversation();
    nearbyNpcLabel.textContent = 'Walk near a citizen';
    renderNpcVoice(null);
    traitsEl.replaceChildren();
    renderConversation(null);
    return;
  }

  const nextKey = conversationKeyFromIds(nextIds);
  if (previousKey && nextKey !== previousKey && conversations.has(previousKey) && !conversations.has(nextKey)) {
    conversations.set(nextKey, [...conversations.get(previousKey)]);
    copyConversationMemory(previousKey, nextKey);
  }

  activeConversationKey = nextKey;
  activeParticipantIds = nextIds;
  activeNpcId = nonPlayerIds[0];
  const participants = await loadParticipants(nextIds);
  nearbyNpcLabel.textContent = participantLabel(participants);
  renderTraits(participants.find((participant) => !participant.isPlayer)?.metadata || participants[0].metadata);
  renderConversation(nextKey);
  const activeParticipant = participants.find((participant) => participant.id === activeNpcId);
  renderNpcVoice(activeParticipant
    ? await resolveNpcVoice(activeParticipant.id, activeParticipant.metadata)
    : null);
}

async function resizePopulationPreservingState() {
  const previousKey = activeConversationKey;
  npcIds = generateNpcIds(populationSize, playerId);
  if (!npcIds.includes(playerId)) npcIds[0] = playerId;
  addCitizens(npcIds);
  await reconcileActiveConversationAfterRosterChange(previousKey);
}

async function switchPlayerCharacter(nextPlayerId) {
  if (!hasBgRemovedNpcAsset(nextPlayerId) || nextPlayerId === playerId) return;

  const previousPlayerId = playerId;
  const previousKey = activeConversationKey;
  const playerPosition = player.position.clone();
  playerId = nextPlayerId;
  if (!npcIds.includes(playerId)) npcIds[0] = playerId;

  activeParticipantIds = activeParticipantIds
    .map((id) => id === previousPlayerId ? playerId : id)
    .filter((id, index, ids) => ids.indexOf(id) === index);
  if (!isPlayerAutoModeEnabled()) {
    activeParticipantIds = activeParticipantIds.filter((id) => id !== playerId);
  }
  pendingParticipantIds = pendingParticipantIds.filter((id) => id !== playerId && id !== previousPlayerId);

  addPlayer(playerId);
  addCitizens(npcIds);
  const previousPlayerSprite = spriteForNpcId(previousPlayerId);
  if (previousPlayerSprite) {
    previousPlayerSprite.position.set(playerPosition.x, previousPlayerSprite.position.y, playerPosition.z);
    syncVehicleToSprite(previousPlayerSprite);
    assignWalkTarget(previousPlayerSprite);
  }
  await reconcileActiveConversationAfterRosterChange(previousKey);
}

function shuffleCitizens() {
  districtIndex = (districtIndex + 1) % districts.length;
  districtName.textContent = districts[districtIndex];
  rebuildPopulation({ keepPlayer: false, shuffle: true });
}

function citizenNearPosition(position, maxDistance = collisionTalkDistance, ignoreActiveParticipants = false) {
  let nearest = null;
  let nearestDistanceSq = Infinity;
  const maxDistanceSq = maxDistance * maxDistance;

  citizens.children.forEach((sprite) => {
    if (ignoreActiveParticipants && activeParticipantIds.includes(sprite.userData.id)) return;
    if (isOnConversationLeaveCooldown(sprite.userData.id)) return;

    const distanceSq = sprite.position.distanceToSquared(position);
    if (distanceSq < nearestDistanceSq) {
      nearest = sprite;
      nearestDistanceSq = distanceSq;
    }
  });

  return nearestDistanceSq <= maxDistanceSq ? nearest : null;
}

function startCollisionConversation(sprite) {
  if (!sprite) return;
  if (isOnConversationLeaveCooldown(sprite.userData.id)) return;

  if (activeConversationKey) {
    queuePendingConversationSprites([
      sprite,
      ...closestCitizenSprites(sprite.position, maxConversationParticipants, farewellDistanceSq)
        .filter((nearbySprite) => nearbySprite !== sprite)
    ]);
    return;
  }

  const group = [
    sprite,
    ...closestCitizenSprites(sprite.position, maxConversationParticipants, farewellDistanceSq)
      .filter((nearbySprite) => nearbySprite !== sprite)
  ];
  setActiveConversation(group);
}

async function loadMetadata(id) {
  if (metadataCache.has(id)) return metadataCache.get(id);

  const response = await fetch(metadataPath(id));
  if (!response.ok) throw new Error(`Could not load metadata for NPC #${id}`);

  const metadata = await response.json();
  metadataCache.set(id, metadata);
  return metadata;
}

function traitText(metadata) {
  return (metadata.attributes || [])
    .map((attribute) => `${attribute.trait_type}: ${attribute.value}`)
    .join(', ');
}

function hasSamuraiTrait(metadata) {
  return (metadata.attributes || []).some((attribute) => {
    return /samurai|samuri|ronin|katana|shogun/i.test(`${attribute.trait_type} ${attribute.value}`);
  });
}

function speechStyleForMetadata(metadata) {
  if (!hasSamuraiTrait(metadata)) return '';
  return [
    'Speech style: Mandarin Chinese / Chinese-English cadence with samurai formality.',
    'Use occasional short Mandarin words or phrases like "shi", "bu", "hao", "qing", "mingbai", or "xiongdi", but keep the line understandable in English.',
    'Mannerisms: disciplined, terse, honor-bound, indirect, proverb-like, blade/dojo metaphors.',
    'Do not write caricature or broken gibberish; make it respectful and characterful.'
  ].join(' ');
}

function stableHash(value) {
  return String(value).split('').reduce((hash, character) => {
    return ((hash << 5) - hash + character.charCodeAt(0)) | 0;
  }, 0);
}

function runtimeNameForNpc(id, metadata = null) {
  if (npcRuntimeNames.has(id)) return npcRuntimeNames.get(id);

  const seed = Math.abs(stableHash(`${id}-${traitText(metadata || {})}`));
  const name = `${givenNames[seed % givenNames.length]} ${handleNames[Math.floor(seed / givenNames.length) % handleNames.length]}`;
  npcRuntimeNames.set(id, name);
  return name;
}

function conversationKeyFromIds(ids) {
  return [...ids].sort((a, b) => a - b).join(':');
}

function participantLabel(participants) {
  const nonPlayerParticipants = participants.filter((participant) => !participant.isPlayer);
  if (nonPlayerParticipants.length === 0) return 'Walk near a citizen';
  if (nonPlayerParticipants.length === 1) return nonPlayerParticipants[0].name;
  if (nonPlayerParticipants.length === 2) return `${nonPlayerParticipants[0].name} and ${nonPlayerParticipants[1].name}`;
  return `${nonPlayerParticipants.slice(0, -1).map((participant) => participant.name).join(', ')} and ${nonPlayerParticipants.at(-1).name}`;
}

function normalizeSpeakerName(name) {
  return String(name || '').trim().toLowerCase();
}

function speakerLinesFromDialogue(text, participants) {
  const speakerIdsByName = new Map(
    participants.map((participant) => [normalizeSpeakerName(participant.name), participant.id])
  );
  const lines = [];

  String(text || '').split('\n').forEach((rawLine) => {
    const line = rawLine.trim();
    if (!line) return;

    const match = line.match(/^([A-Za-z][A-Za-z\s'-]{0,40}):\s*(.+)$/);
    if (match) {
      const id = speakerIdsByName.get(normalizeSpeakerName(match[1]));
      if (id) lines.push({ id, text: match[2].trim() });
      return;
    }

    const firstNonPlayer = participants.find((participant) => !participant.isPlayer) || participants[0];
    if (firstNonPlayer) lines.push({ id: firstNonPlayer.id, text: line });
  });

  return lines.slice(0, maxDialogueLines);
}

function stopTalkingIndicators() {
  activeSpeakerIds.clear();
  activeSpeechBubbles.forEach((bubble) => bubble.remove());
  activeSpeechBubbles.clear();
  talkingUntil = 0;
}

function showTalkingTurn(line, durationMs = 3200) {
  stopTalkingIndicators();
  if (!line) return;

  talkingUntil = performance.now() + durationMs;
  activeSpeakerIds.add(line.id);
  const bubble = document.createElement('div');
  bubble.className = 'speech-bubble';
  bubble.textContent = line.text;
  speechLayer.append(bubble);
  activeSpeechBubbles.set(line.id, bubble);
}

function talkingTurnDuration(line) {
  return THREE.MathUtils.clamp(1500 + line.text.length * 58, 2400, 5200);
}

function wait(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function clearPrefetchedConversation() {
  prefetchedConversationKey = null;
  prefetchedConversationPromise = null;
  prefetchedConversationReply = null;
}

function prefetchNextConversation(participants) {
  if (!getOpenAiKey() || participants.length === 0) return;

  const key = conversationKeyFromIds(participants.map((participant) => participant.id));
  if (key !== activeConversationKey) return;
  if (prefetchedConversationKey === key && (prefetchedConversationPromise || prefetchedConversationReply)) return;

  prefetchedConversationKey = key;
  prefetchedConversationReply = null;
  prefetchedConversationPromise = callConversationAi({ participants, eventType: 'continue' })
    .then((reply) => {
      if (activeConversationKey === key && reply) {
        prefetchedConversationReply = reply;
        return reply;
      }

      return null;
    })
    .catch((error) => {
      if (activeConversationKey === key) appendMessage('system', error.message);
      return null;
    })
    .finally(() => {
      prefetchedConversationPromise = null;
    });
}

async function nextConversationReply(participants, eventType, userMessage = '') {
  const key = conversationKeyFromIds(participants.map((participant) => participant.id));
  if (eventType === 'continue' && prefetchedConversationKey === key) {
    const reply = prefetchedConversationReply || await prefetchedConversationPromise;
    clearPrefetchedConversation();
    if (reply) return reply;
  }

  clearPrefetchedConversation();
  return callConversationAi({ participants, userMessage, eventType });
}

async function playDialogueTurns(reply, participants) {
  const lines = speakerLinesFromDialogue(reply, participants);
  if (!lines.length) return;
  const key = conversationKeyFromIds(participants.map((participant) => participant.id));
  const runId = conversationRunId;

  for (const line of lines) {
    if (activeConversationKey !== key || runId !== conversationRunId) return;
    const participant = participants.find((entry) => entry.id === line.id);
    if (!participant) continue;

    showTalkingTurn(line, isVoiceModeEnabled() ? 12000 : talkingTurnDuration(line));

    if (isVoiceModeEnabled()) {
      await queueElevenLabsSpeech(line.text, participant.id, participant.metadata);
    } else {
      await wait(talkingTurnDuration(line));
      stopTalkingIndicators();
    }
  }
}

async function loadParticipants(ids) {
  return Promise.all(ids.map(async (id) => {
    const metadata = await loadMetadata(id);
    const isPlayer = id === playerId;
    return {
      id,
      isPlayer,
      metadata,
      name: isPlayer ? 'You' : runtimeNameForNpc(id, metadata),
      traits: `${traitText(metadata)}${speechStyleForMetadata(metadata) ? `. ${speechStyleForMetadata(metadata)}` : ''}${isPlayer ? ', player character' : ''}`
    };
  }));
}

function conversationIdsFromSprites(sprites) {
  const ids = sprites
    .map((sprite) => sprite.userData.id)
    .filter((id) => !isOnConversationLeaveCooldown(id));
  if (isPlayerAutoModeEnabled()) ids.unshift(playerId);
  return [...new Set(ids)].slice(0, maxConversationParticipants + Number(isPlayerAutoModeEnabled()));
}

function queuePendingConversationSprites(sprites) {
  if (!activeConversationKey) return;

  const openSlots = Math.max(0, maxConversationParticipants - activeParticipantIds.length - pendingParticipantIds.length);
  if (openSlots === 0) return;

  const queuedIds = sprites
    .map((sprite) => sprite.userData.id)
    .filter((id) => {
      return id !== playerId
        && !activeParticipantIds.includes(id)
        && !pendingParticipantIds.includes(id)
        && !isOnConversationLeaveCooldown(id);
    })
    .slice(0, openSlots);

  if (queuedIds.length === 0) return;

  pendingParticipantIds = [...new Set([...pendingParticipantIds, ...queuedIds])];
  clearPrefetchedConversation();
  nextConversationBeatAt = Math.min(nextConversationBeatAt, performance.now() + prefetchedConversationBeatIntervalMs);
}

function isOnConversationLeaveCooldown(id) {
  const expiresAt = conversationLeaveCooldowns.get(id) || 0;
  if (expiresAt <= performance.now()) {
    conversationLeaveCooldowns.delete(id);
    return false;
  }

  return true;
}

function nearbyCitizenSprites(maxDistanceSq = conversationDistanceSq) {
  return citizens.children
    .map((sprite) => ({
      sprite,
      distanceSq: sprite.position.distanceToSquared(player.position)
    }))
    .filter((entry) => entry.distanceSq <= maxDistanceSq && !isOnConversationLeaveCooldown(entry.sprite.userData.id))
    .sort((left, right) => left.distanceSq - right.distanceSq)
    .slice(0, maxConversationParticipants)
    .map((entry) => entry.sprite);
}

function closestCitizenSprites(position, limit = maxConversationParticipants, maxDistanceSq = farewellDistanceSq) {
  return citizens.children
    .map((sprite) => ({
      sprite,
      distanceSq: sprite.position.distanceToSquared(position)
    }))
    .filter((entry) => entry.distanceSq <= maxDistanceSq && !isOnConversationLeaveCooldown(entry.sprite.userData.id))
    .sort((left, right) => left.distanceSq - right.distanceSq)
    .slice(0, limit)
    .map((entry) => entry.sprite);
}

function activeConversationSprites(maxDistanceSq = farewellDistanceSq) {
  if (activeParticipantIds.length === 0) return [];
  return citizens.children.filter((sprite) => {
    return activeParticipantIds.includes(sprite.userData.id)
      && sprite.userData.id !== playerId
      && sprite.position.distanceToSquared(player.position) <= maxDistanceSq;
  });
}

function attachSteeringVehicle(sprite) {
  const vehicle = new YUKA.Vehicle();
  vehicle.position.set(sprite.position.x, 0, sprite.position.z);
  vehicle.maxSpeed = sprite.userData.speed || 4;
  vehicle.maxForce = 18;
  vehicle.mass = 1;
  vehicle.updateOrientation = false;
  vehicle.updateNeighborhood = true;
  vehicle.neighborhoodRadius = npcPersonalSpace * 1.65;

  const arrive = new YUKA.ArriveBehavior(new YUKA.Vector3(sprite.position.x, 0, sprite.position.z), 2.4, 0.8);
  arrive.weight = 1.2;
  const separation = new YUKA.SeparationBehavior();
  separation.weight = 2.8;
  vehicle.steering.add(arrive);
  vehicle.steering.add(separation);
  steeringEntities.add(vehicle);
  sprite.userData.steering = { vehicle, arrive, separation };
}

function syncVehicleToSprite(sprite) {
  const steering = sprite.userData.steering;
  if (!steering) return;
  steering.vehicle.position.set(sprite.position.x, 0, sprite.position.z);
}

function syncSpriteToVehicle(sprite) {
  const steering = sprite.userData.steering;
  if (!steering) return;
  sprite.position.x = THREE.MathUtils.clamp(steering.vehicle.position.x, -mapLimit, mapLimit);
  sprite.position.z = THREE.MathUtils.clamp(steering.vehicle.position.z, -mapLimit, mapLimit);
  steering.vehicle.position.set(sprite.position.x, 0, sprite.position.z);
}

function setSteeringTarget(sprite, target, options = {}) {
  const steering = sprite.userData.steering;
  if (!steering) return;
  const active = Boolean(options.active);
  steering.vehicle.maxSpeed = active
    ? Math.max(3.4, (sprite.userData.speed || 4) * 1.15)
    : (sprite.userData.speed || 4);
  steering.vehicle.maxForce = active ? 24 : 18;
  steering.vehicle.neighborhoodRadius = active ? npcCrowdPersonalSpace * 1.9 : npcPersonalSpace * 1.65;
  steering.arrive.deceleration = active ? 1.5 : 2.4;
  steering.arrive.tolerance = active ? 0.55 : 0.9;
  steering.arrive.weight = active ? 1.9 : 1.2;
  steering.separation.weight = active ? 3.8 : 2.6;
  steering.arrive.target.set(target.x, 0, target.z);
}

function stableUnit(id, salt = '') {
  const seed = Math.abs(stableHash(`${id}-${salt}`));
  return (seed % 10000) / 10000;
}

function clampNpcToMap(sprite) {
  sprite.position.x = THREE.MathUtils.clamp(sprite.position.x, -mapLimit, mapLimit);
  sprite.position.z = THREE.MathUtils.clamp(sprite.position.z, -mapLimit, mapLimit);
}

function conversationAnchorForSprite(sprite, sprites) {
  const count = Math.max(1, sprites.length);
  const radius = crowdAnchorRadius + Math.max(0, count - 4) * 0.38;
  const sortedIds = sprites.map((entry) => entry.userData.id).sort((left, right) => left - right);
  const index = Math.max(0, sortedIds.indexOf(sprite.userData.id));
  const slotAngle = activeConversationFormationAngle
    + (index / count) * Math.PI * 2
    + (stableUnit(sprite.userData.id, 'crowd-angle') - 0.5) * 0.22;
  const jitter = (stableUnit(sprite.userData.id, 'crowd-radius') - 0.5) * 0.9;

  crowdAnchor.set(
    player.position.x + Math.cos(slotAngle) * (radius + jitter),
    sprite.position.y,
    player.position.z + Math.sin(slotAngle) * (radius + jitter)
  );
  return crowdAnchor;
}

function applyConversationCrowdAnchors(delta) {
  const sprites = activeConversationSprites(farewellDistanceSq);
  if (sprites.length === 0) return;

  sprites.forEach((sprite) => {
    const anchor = conversationAnchorForSprite(sprite, sprites);
    crowdDelta.subVectors(anchor, sprite.position);
    crowdDelta.y = 0;
    const maxStep = (sprite.userData.speed || 4) * 1.4 * delta;
    const distance = crowdDelta.length();
    if (distance > 0.001 && maxStep > 0) {
      const step = Math.min(distance, Math.max(maxStep, distance * crowdAnchorForce * delta));
      sprite.position.addScaledVector(crowdDelta, step / distance);
    }
    clampNpcToMap(sprite);
  });
}

function applyCrowdSeparation(delta) {
  const sprites = citizens.children;
  const activeIds = new Set(activeParticipantIds);

  for (let step = 0; step < crowdRelaxationSteps; step += 1) {
    for (let leftIndex = 0; leftIndex < sprites.length; leftIndex += 1) {
      const left = sprites[leftIndex];
      for (let rightIndex = leftIndex + 1; rightIndex < sprites.length; rightIndex += 1) {
        const right = sprites[rightIndex];
        const leftActive = activeIds.has(left.userData.id);
        const rightActive = activeIds.has(right.userData.id);
        const desiredSpace = leftActive || rightActive ? npcCrowdPersonalSpace : npcPersonalSpace;
        const desiredSpaceSq = leftActive || rightActive ? npcCrowdPersonalSpaceSq : npcPersonalSpaceSq;

        crowdDelta.subVectors(left.position, right.position);
        crowdDelta.y = 0;
        const distanceSq = crowdDelta.lengthSq();
        if (distanceSq >= desiredSpaceSq) continue;

        if (distanceSq < 0.0001) {
          const angle = stableUnit(`${left.userData.id}-${right.userData.id}`, 'overlap') * Math.PI * 2;
          crowdDelta.set(Math.cos(angle), 0, Math.sin(angle));
        } else {
          crowdDelta.normalize();
        }

        const distance = Math.sqrt(Math.max(distanceSq, 0.0001));
        const overlap = desiredSpace - distance;
        const push = Math.min(overlap * 0.5, crowdSeparationForce * delta);

        left.position.addScaledVector(crowdDelta, push);
        right.position.addScaledVector(crowdDelta, -push);
        clampNpcToMap(left);
        clampNpcToMap(right);
      }
    }
  }
}

function updateCrowdGraphSpacing(delta) {
  applyConversationCrowdAnchors(delta);
  applyCrowdSeparation(delta);
}

function textParts(value) {
  return String(value || '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

function npcTraitWords(metadata) {
  return (metadata.attributes || []).flatMap((attribute) => [
    ...textParts(attribute.trait_type),
    ...textParts(attribute.value)
  ]);
}

function inferVoiceProfile(metadata) {
  const words = new Set(npcTraitWords(metadata));
  const profile = {
    gender: null,
    age: null,
    tones: ['expressive'],
    accent: null
  };

  if (words.has('beard') || words.has('mustache') || words.has('fluff')) {
    profile.gender = 'male';
    profile.age = 'middle-aged';
    profile.tones.push('deep', 'warm', 'raspy');
  }

  if (words.has('hair') || words.has('tail')) {
    profile.age = profile.age || 'young';
    profile.tones.push('bright', 'energetic');
  }

  if (words.has('punk')) {
    profile.age = profile.age || 'young';
    profile.tones.push('confident', 'gritty', 'street');
  }

  if (words.has('lazyfit')) profile.tones.push('relaxed', 'casual');
  if (words.has('greyfit')) profile.tones.push('steady', 'dry');
  if (words.has('cloud')) profile.tones.push('soft', 'airy');
  if (words.has('pebble')) profile.tones.push('calm', 'grounded');
  if (words.has('grape')) profile.tones.push('quirky', 'playful');

  if (!profile.gender) {
    profile.gender = Math.abs(stableHash(metadata.name || traitText(metadata))) % 2 === 0 ? 'male' : 'female';
  }

  profile.age = profile.age || (Math.abs(stableHash(`${metadata.name}-age`)) % 3 === 0 ? 'middle-aged' : 'young');
  return profile;
}

function searchableVoiceText(voice) {
  const labels = voice.labels || {};
  return [
    voice.name,
    voice.description,
    labels.gender,
    labels.age,
    labels.accent,
    labels.description,
    labels.use_case
  ].join(' ').toLowerCase();
}

function scoreVoiceForProfile(voice, profile, npcId) {
  const labels = voice.labels || {};
  const text = searchableVoiceText(voice);
  let score = 0;

  if (labels.gender?.toLowerCase() === profile.gender) score += 8;
  if (labels.age?.toLowerCase() === profile.age) score += 5;
  if (profile.accent && labels.accent?.toLowerCase() === profile.accent) score += 3;
  profile.tones.forEach((tone) => {
    if (text.includes(tone)) score += 2;
  });

  score += Math.abs(stableHash(`${npcId}-${voice.voice_id}`)) % 100 / 100;
  return score;
}

function currentVoiceVarietyProfile() {
  return voiceVarietyProfiles[voiceVarietySelect.value] || voiceVarietyProfiles.varied;
}

function voiceUsageCount(voiceId) {
  return [...npcVoiceAssignments.values()]
    .filter((assignment) => assignment.voice?.voice_id === voiceId)
    .length;
}

async function getElevenLabsVoices() {
  const apiKey = getElevenLabsKey();
  if (!apiKey) return fallbackVoices;

  if (elevenLabsVoiceListPromise && elevenLabsVoiceListKey === apiKey) {
    return elevenLabsVoiceListPromise;
  }

  elevenLabsVoiceListKey = apiKey;
  elevenLabsVoiceListPromise = fetch('https://api.elevenlabs.io/v1/voices', {
    headers: { 'xi-api-key': apiKey }
  })
    .then(async (response) => {
      if (!response.ok) throw new Error(`ElevenLabs voices request failed: ${response.status}`);
      const data = await response.json();
      return Array.isArray(data.voices) && data.voices.length > 0 ? data.voices : fallbackVoices;
    })
    .catch(() => fallbackVoices);

  return elevenLabsVoiceListPromise;
}

async function resolveNpcVoice(npcId, metadata) {
  if (npcVoiceAssignments.has(npcId)) return npcVoiceAssignments.get(npcId);

  const voices = await getElevenLabsVoices();
  const profile = inferVoiceProfile(metadata);
  const varietyProfile = currentVoiceVarietyProfile();
  const rankedVoices = [...voices]
    .filter((voice) => voice.voice_id)
    .map((voice) => {
      const usePenalty = voiceUsageCount(voice.voice_id) * varietyProfile.usagePenalty;
      const noise = stableUnit(`${npcId}-${voice.voice_id}`, 'voice-rank') * varietyProfile.scoreNoise;
      return {
        voice,
        score: scoreVoiceForProfile(voice, profile, npcId) - usePenalty + noise
      };
    })
    .sort((left, right) => right.score - left.score);
  const voicePool = rankedVoices.slice(0, Math.max(1, Math.min(varietyProfile.poolSize, rankedVoices.length)));
  const voice = voicePool[Math.floor(stableUnit(npcId, 'voice-pool') * voicePool.length)]?.voice || {
    voice_id: getElevenLabsVoiceId(),
    name: 'Fallback voice',
    labels: {}
  };

  const assignment = { voice, profile };
  npcVoiceAssignments.set(npcId, assignment);
  return assignment;
}

function renderNpcVoice(assignment) {
  if (!assignment) {
    npcVoiceLabel.textContent = 'Voice: automatic';
    return;
  }

  const { voice, profile } = assignment;
  const labels = voice.labels || {};
  const labelParts = [labels.gender || profile.gender, labels.age || profile.age].filter(Boolean);
  npcVoiceLabel.textContent = `Voice: ${voice.name || 'matched'}${labelParts.length ? ` (${labelParts.join(', ')})` : ''}`;
}

function renderTraits(metadata) {
  traitsEl.replaceChildren();
  (metadata.attributes || []).slice(0, 8).forEach((attribute) => {
    const pill = document.createElement('span');
    pill.className = 'trait-pill';
    pill.textContent = `${attribute.trait_type}: ${attribute.value}`;
    traitsEl.append(pill);
  });
}

function appendMessage(role, content, options = {}) {
  if (role === 'system') {
    const message = String(content || '');
    if (/failed|error|blocked|key|request|quota|rate|invalid/i.test(message)) {
      console.warn(`[NPC City] ${message}`);
    }
  }

  const message = document.createElement('div');
  message.className = `chat-message ${role}${options.voice ? ' voice' : ''}`;
  message.textContent = content;
  chatLog.append(message);
  chatLog.scrollTop = chatLog.scrollHeight;
}

function setButtonIcon(button, iconName) {
  button.replaceChildren();
  const icon = document.createElement('i');
  icon.setAttribute('data-lucide', iconName);
  icon.setAttribute('aria-hidden', 'true');
  button.append(icon);
  createIcons({ icons });
}

function renderConversation(key) {
  chatLog.replaceChildren();
  const conversation = conversations.get(key) || [];
  if (conversation.length === 0) {
    if (!apiKeyInput.value.trim()) {
      appendMessage('system', 'Enter an OpenAI API key to start nearby conversations.');
    } else if (isVoiceModeEnabled() && !getElevenLabsKey()) {
      appendMessage('system', 'Enter an ElevenLabs API key to use voice mode.');
    } else {
      appendMessage('system', 'Move closer or say hello.');
    }
    return;
  }

  conversation.forEach((message) => {
    if (message.role === 'user') {
      appendMessage('user', message.content);
      return;
    }

    if (message.voiceOnly) {
      appendMessage('npc', 'Voice reply generated.', { voice: true });
      return;
    }

    appendMessage('npc', message.content);
  });
}

async function setActiveConversation(sprites, eventType = 'greeting') {
  const ids = conversationIdsFromSprites(sprites);
  const key = conversationKeyFromIds(ids);
  if (activeConversationKey === key) return;

  if (activeConversationKey && ids.some((id) => activeParticipantIds.includes(id))) {
    queuePendingConversationSprites(sprites);
    return;
  }

  if (ids.length === 0) {
    conversationRunId += 1;
    activeNpcId = null;
    activeConversationKey = null;
    activeParticipantIds = [];
    pendingParticipantIds = [];
    stopActiveNpcAudio();
    stopTalkingIndicators();
    clearPrefetchedConversation();
    nearbyNpcLabel.textContent = 'Walk near a citizen';
    renderNpcVoice(null);
    traitsEl.replaceChildren();
    renderConversation(null);
    return;
  }

  try {
    const previousKey = activeConversationKey;
    const previousIds = activeParticipantIds;
    const hasOverlap = previousKey && previousIds.some((id) => ids.includes(id));
    if (previousKey !== key) {
      conversationRunId += 1;
      stopActiveNpcAudio();
      stopTalkingIndicators();
      clearPrefetchedConversation();
      if (!hasOverlap) {
        activeConversationFormationAngle = stableUnit(key, 'formation-angle') * Math.PI * 2;
      }
    }
    activeConversationKey = key;
    activeParticipantIds = ids;
    pendingParticipantIds = [];
    activeNpcId = ids[0];
    nextConversationBeatAt = performance.now() + conversationBeatIntervalMs;
    const participants = await loadParticipants(ids);
    const hasNewArrival = hasOverlap && ids.some((id) => !previousIds.includes(id));
    if (hasOverlap && !conversations.has(key)) {
      conversations.set(key, [...(conversations.get(previousKey) || [])]);
      copyConversationMemory(previousKey, key);
    }
    nearbyNpcLabel.textContent = participantLabel(participants);
    renderTraits(participants[0].metadata);
    renderConversation(key);
    renderNpcVoice(await resolveNpcVoice(participants[0].id, participants[0].metadata));

    maybeContinueConversation(participants, hasNewArrival ? 'arrival' : eventType);
  } catch (error) {
    appendMessage('system', error.message);
  }
}

function setActiveNpc(sprite) {
  return setActiveConversation(sprite ? [sprite] : []);
}

function setChatPanelClosed(isClosed) {
  chatPanel.classList.toggle('is-closed', isClosed);
  localStorage.setItem('npc-city-chat-panel-closed', String(isClosed));
  toggleChatPanel.title = isClosed ? 'Open chat panel' : 'Close chat panel';
  toggleChatPanel.setAttribute('aria-label', toggleChatPanel.title);
}

function getOpenAiKey() {
  return apiKeyInput.value.trim();
}

function getElevenLabsKey() {
  return elevenLabsKeyInput.value.trim();
}

function getElevenLabsVoiceId() {
  return elevenLabsVoiceIdInput.value.trim() || 'JBFqnCBsd6RMkjVDRZzb';
}

function isVoiceModeEnabled() {
  return voiceModeInput.checked;
}

function isPlayerAutoModeEnabled() {
  return playerAutoModeInput.checked;
}

function selectedConversationTopicPrompt() {
  return conversationTopicPrompts[conversationTopicSelect.value] || conversationTopicPrompts.street;
}

function extractOutputText(data) {
  return data.output_text || data.output?.flatMap((item) => item.content || [])
    .map((part) => part.text)
    .filter(Boolean)
    .join('\n') || '';
}

function parseJsonObject(text) {
  try {
    return JSON.parse(text);
  } catch {
    const match = String(text || '').match(/\{[\s\S]*\}/);
    if (!match) return null;

    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

async function fetchTextWithCorsFallback(url) {
  try {
    const localResponse = await fetch(`/api/rss?url=${encodeURIComponent(url)}`);
    if (localResponse.ok) return localResponse.text();
  } catch {}

  try {
    const response = await fetch(url);
    if (response.ok) return response.text();
  } catch {}

  const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
  const response = await fetch(proxyUrl);
  if (!response.ok) throw new Error(`Feed request failed: ${response.status}`);
  return response.text();
}

function parseFeedItems(xmlText, source) {
  const document = new DOMParser().parseFromString(xmlText, 'text/xml');
  return [...document.querySelectorAll('item, entry')]
    .slice(0, 8)
    .map((item) => {
      const title = item.querySelector('title')?.textContent?.trim() || '';
      const summary = item.querySelector('description, summary')?.textContent?.replace(/<[^>]*>/g, '').trim() || '';
      return title ? { source, title, summary } : null;
    })
    .filter(Boolean);
}

async function fetchMarketPrices() {
  try {
    const url = 'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana,ripple,dogecoin&vs_currencies=usd&include_24hr_change=true';
    const response = await fetch(url);
    if (!response.ok) throw new Error('price fetch failed');
    const data = await response.json();
    const labels = {
      bitcoin: 'BTC',
      ethereum: 'ETH',
      solana: 'SOL',
      ripple: 'XRP',
      dogecoin: 'DOGE'
    };
    return Object.entries(labels).map(([id, label]) => {
      const price = data[id]?.usd;
      const change = data[id]?.usd_24h_change;
      if (!Number.isFinite(price)) return null;
      const formattedPrice = price >= 1 ? `$${price.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : `$${price.toFixed(4)}`;
      const formattedChange = Number.isFinite(change) ? ` (${change >= 0 ? '+' : ''}${change.toFixed(2)}% 24h)` : '';
      return `${label} ${formattedPrice}${formattedChange}`;
    }).filter(Boolean).join(', ');
  } catch {
    return '';
  }
}

async function fetchLiveTopicsFromBackend() {
  const response = await fetch('/api/live-topics', { cache: 'no-store' });
  if (!response.ok) throw new Error(`Live topics failed: ${response.status}`);
  const data = await response.json();
  return {
    topics: Array.isArray(data.topics) ? data.topics : [],
    priceContext: typeof data.priceContext === 'string' ? data.priceContext : ''
  };
}

function renderMarketTopicOptions({ loading = false } = {}) {
  const previousValue = marketTopicSelect.value;
  marketTopicSelect.replaceChildren();

  [
    { value: 'off', label: 'Off' },
    { value: 'random', label: 'Random live topic' }
  ].forEach((optionData) => {
    const option = document.createElement('option');
    option.value = optionData.value;
    option.textContent = optionData.label;
    marketTopicSelect.append(option);
  });

  marketTopics.forEach((topic, index) => {
    const option = document.createElement('option');
    option.value = `topic-${index}`;
    option.textContent = `${topic.source}: ${topic.title}`.slice(0, 110);
    marketTopicSelect.append(option);
  });

  if (marketTopics.length === 0) {
    const option = document.createElement('option');
    option.value = 'empty';
    option.disabled = true;
    option.textContent = loading ? 'Loading live topics...' : 'No live topics loaded';
    marketTopicSelect.append(option);
  }

  marketTopicSelect.value = [...marketTopicSelect.options].some((option) => option.value === previousValue)
    ? previousValue
    : (localStorage.getItem('npc-city-market-topic') || 'off');
}

async function loadMarketTopics({ force = false } = {}) {
  if (!force && marketTopicLastLoadedAt && Date.now() - marketTopicLastLoadedAt < marketTopicRefreshIntervalMs) return;
  marketTopicLastLoadedAt = Date.now();
  renderMarketTopicOptions({ loading: true });

  try {
    const backendResult = await fetchLiveTopicsFromBackend();
    if (backendResult.topics.length > 0 || backendResult.priceContext) {
      marketTopics = backendResult.topics.slice(0, 96);
      marketPriceContext = backendResult.priceContext;
      renderMarketTopicOptions();
      return;
    }
  } catch {}

  try {
    const feedResults = await Promise.allSettled(marketFeeds.map(async (feed) => {
      const xml = await fetchTextWithCorsFallback(feed.url);
      return parseFeedItems(xml, feed.name);
    }));
    marketTopics = feedResults
      .flatMap((result) => result.status === 'fulfilled' ? result.value : [])
      .slice(0, 72);
    marketPriceContext = await fetchMarketPrices();
    renderMarketTopicOptions();
  } catch {
    marketPriceContext = await fetchMarketPrices();
    renderMarketTopicOptions();
  }
}

async function refreshMarketTopicsForConversation({ force = false } = {}) {
  const previousTopicSignature = marketTopics.map((topic) => topic.title).join('|');
  const previousPriceContext = marketPriceContext;
  await loadMarketTopics({ force });
  const nextTopicSignature = marketTopics.map((topic) => topic.title).join('|');

  if (marketTopicSelect.value !== 'off'
    && (previousTopicSignature !== nextTopicSignature || previousPriceContext !== marketPriceContext)) {
    clearPrefetchedConversation();
    if (activeConversationKey) {
      nextConversationBeatAt = Math.min(nextConversationBeatAt, performance.now() + prefetchedConversationBeatIntervalMs);
    }
  }
}

async function resetNewsCycle() {
  resetNewsCycleButton.disabled = true;
  resetNewsCycleButton.title = 'Refreshing news cycle';
  resetNewsCycleButton.setAttribute('aria-label', 'Refreshing news cycle');
  resetConversationMemory();
  clearPrefetchedConversation();
  marketTopicLastLoadedAt = 0;

  try {
    await refreshMarketTopicsForConversation({ force: true });
    if (marketTopicSelect.value === 'off') {
      marketTopicSelect.value = 'random';
      localStorage.setItem('npc-city-market-topic', marketTopicSelect.value);
    }
    if (activeConversationKey) {
      nextConversationBeatAt = performance.now() + prefetchedConversationBeatIntervalMs;
    }
    appendMessage('system', 'News cycle reset. Live topics and conversation memory cleared.');
  } catch (error) {
    appendMessage('system', error.message);
  } finally {
    resetNewsCycleButton.disabled = false;
    resetNewsCycleButton.title = 'Reset news cycle';
    resetNewsCycleButton.setAttribute('aria-label', 'Reset news cycle');
  }
}

function topicKey(topic) {
  return topic ? `${topic.source}:${topic.title}` : '';
}

function memoryForConversation(key = activeConversationKey || 'city') {
  if (!conversationTopicMemory.has(key)) {
    conversationTopicMemory.set(key, { topics: [], phrases: [] });
  }

  return conversationTopicMemory.get(key);
}

function copyConversationMemory(previousKey, nextKey) {
  if (!previousKey || !nextKey || previousKey === nextKey) return;
  const previousMemory = memoryForConversation(previousKey);
  conversationTopicMemory.set(nextKey, {
    topics: [...previousMemory.topics],
    phrases: [...previousMemory.phrases]
  });
}

function resetConversationMemory() {
  conversationTopicMemory.clear();
  npcDialogueMemory.clear();
  cityDialogueMemory.length = 0;
}

function rememberConversationTopic(key, topic) {
  if (!topic) return;
  const memory = memoryForConversation(key);
  memory.topics = [topicKey(topic), ...memory.topics.filter((entry) => entry !== topicKey(topic))].slice(0, 18);
}

function rememberConversationPhrases(key, phraseKeys) {
  const memory = memoryForConversation(key);
  memory.phrases = [...phraseKeys, ...memory.phrases.filter((entry) => !phraseKeys.includes(entry))].slice(0, 36);
}

function dialogueFingerprint(text) {
  return String(text || '')
    .replace(/^[A-Za-z][A-Za-z\s'-]{0,40}:\s*/, '')
    .toLowerCase()
    .replace(/["'.,!?;:()]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function recentDialogueFingerprints() {
  return new Set(cityDialogueMemory.slice(0, 80).map((entry) => entry.fingerprint));
}

function rememberNpcDialogueLine(id, entry) {
  if (!npcDialogueMemory.has(id)) npcDialogueMemory.set(id, []);
  const memory = npcDialogueMemory.get(id);
  memory.unshift(entry);
  memory.splice(10);
}

function rememberDialogue(key, participants, text, role = 'assistant') {
  const participantById = new Map(participants.map((participant) => [participant.id, participant]));
  const lines = role === 'assistant'
    ? speakerLinesFromDialogue(text, participants)
    : [{ id: playerId, text: String(text || '').replace(/^You:\s*/, '').trim() }];

  lines.forEach((line) => {
    const fingerprint = dialogueFingerprint(line.text);
    if (!fingerprint) return;
    const participant = participantById.get(line.id);
    const entry = {
      key,
      id: line.id,
      speaker: participant?.name || (line.id === playerId ? 'You' : `NPC #${line.id}`),
      text: line.text,
      fingerprint
    };
    cityDialogueMemory.unshift(entry);
    if (line.id) rememberNpcDialogueLine(line.id, entry);
  });

  cityDialogueMemory.splice(80);
}

function recentDialoguePrompt(key, participants) {
  const relevantIds = new Set(participants.map((participant) => participant.id));
  const recentCityLines = cityDialogueMemory
    .filter((entry) => entry.key === key || relevantIds.has(entry.id))
    .slice(0, 14)
    .map((entry) => `${entry.speaker}: ${entry.text}`);

  if (recentCityLines.length === 0) return '';
  return [
    'Recent dialogue memory. Continue from this context and do not repeat these exact lines, phrases, jokes, questions, or claims:',
    recentCityLines.join('\n')
  ].join('\n');
}

function recentTopicPrompt(key) {
  const memory = memoryForConversation(key);
  if (!memory.topics.length) return '';
  return `Already discussed recently, do not reuse these same topics or headlines: ${memory.topics.slice(0, 8).join(' | ')}.`;
}

function selectedMarketTopic(key = activeConversationKey) {
  if (marketTopicSelect.value === 'off') return null;
  const memory = memoryForConversation(key);
  const recentTopics = new Set(memory.topics);

  if (marketTopicSelect.value === 'random') {
    if (marketTopics.length === 0) return null;
    const availableTopics = marketTopics.filter((topic) => !recentTopics.has(topicKey(topic)));
    const topicPool = availableTopics.length > 0 ? availableTopics : marketTopics;
    const seed = Math.abs(stableHash(`${key || 'city'}-${(conversations.get(key) || []).length}-${performance.now().toFixed(0)}`));
    return topicPool[seed % topicPool.length];
  }

  const index = Number(marketTopicSelect.value.replace('topic-', ''));
  const topic = marketTopics[index] || null;
  return topic && !recentTopics.has(topicKey(topic)) ? topic : null;
}

function marketContextPrompt(key = activeConversationKey) {
  const topic = selectedMarketTopic(key);
  if (!topic && !marketPriceContext) return '';

  return [
    'Current live news and culture context:',
    marketPriceContext ? `Prices: ${marketPriceContext}.` : '',
    topic ? `Headline from ${topic.source}: ${topic.title}. ${topic.summary ? `Context: ${topic.summary.slice(0, 220)}.` : ''}` : '',
    recentTopicPrompt(key),
    topic
      ? 'Live Topic is ON: the next conversation beat must clearly react to this current event, but do not quote or summarize the headline. Use the characters traits to infer what they care about, misunderstand, mock, fear, or argue over.'
      : '',
    'For markets or crypto, do not give financial advice or tell the player to buy or sell. For gossip, entertainment, and politics, keep it casual, speculative, and character-driven rather than claiming certainty.'
  ].filter(Boolean).join(' ');
}

function sanitizeMixProfile(profile) {
  const topic = allowedMixTopics.includes(profile?.topic) ? profile.topic : 'street';
  const attitude = allowedMixAttitudes.includes(profile?.attitude) ? profile.attitude : 'playful';
  const energy = ['low', 'medium', 'high'].includes(profile?.energy) ? profile.energy : 'medium';
  return { topic, attitude, energy };
}

function mixProfileCacheKey(participants) {
  return participants.map((participant) => {
    return `${participant.id}:${traitText(participant.metadata)}`;
  }).join('|');
}

async function callConversationMixProfileAi(participants) {
  const apiKey = getOpenAiKey();
  if (!apiKey) return sanitizeMixProfile(null);

  const cacheKey = mixProfileCacheKey(participants);
  if (conversationMixProfileCache.has(cacheKey)) {
    return conversationMixProfileCache.get(cacheKey);
  }

  const characterData = participants.map((participant) => ({
    name: participant.name,
    isPlayer: participant.isPlayer,
    traits: (participant.metadata.attributes || []).map((attribute) => ({
      type: attribute.trait_type,
      value: attribute.value
    }))
  }));
  const schemaDescription = {
    topic: allowedMixTopics,
    attitude: allowedMixAttitudes,
    energy: ['low', 'medium', 'high']
  };
  const input = [
    {
      role: 'system',
      content: [
        'You classify NPC conversation style from character metadata.',
        'Return only valid minified JSON.',
        'No markdown, no prose, no extra keys.',
        `Required JSON shape: ${JSON.stringify(schemaDescription)}`
      ].join(' ')
    },
    {
      role: 'user',
      content: JSON.stringify({ characters: characterData })
    }
  ];

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: modelSelect.value,
      input,
      max_output_tokens: 90
    })
  });

  if (!response.ok) {
    return sanitizeMixProfile(null);
  }

  const data = await response.json();
  const profile = sanitizeMixProfile(parseJsonObject(extractOutputText(data)));
  conversationMixProfileCache.set(cacheKey, profile);
  return profile;
}

async function conversationStylePrompt(participants) {
  if (conversationTopicSelect.value !== 'mix') return selectedConversationTopicPrompt();

  const profile = await callConversationMixProfileAi(participants);
  return [
    'Topic mode: mixed from character metadata.',
    conversationTopicPrompts[profile.topic],
    conversationAttitudePrompts[profile.attitude],
    `Energy: ${profile.energy}.`
  ].join(' ');
}

function stopActiveNpcAudio() {
  if (activeNpcAudioSettle) {
    activeNpcAudioSettle();
    activeNpcAudioSettle = null;
  }

  if (activeNpcAudio) {
    activeNpcAudio.pause();
    activeNpcAudio = null;
  }

  if (activeNpcAudioUrl) {
    URL.revokeObjectURL(activeNpcAudioUrl);
    activeNpcAudioUrl = null;
  }
}

function finishActiveNpcAudio() {
  stopActiveNpcAudio();
  stopTalkingIndicators();
}

function voiceSettingRangeValue(npcId, key, [min, max]) {
  return min + (max - min) * stableUnit(npcId, key);
}

function voiceSettingsForNpc(npcId) {
  const varietyProfile = currentVoiceVarietyProfile();
  return {
    stability: Number(voiceSettingRangeValue(npcId, 'voice-stability', varietyProfile.stability).toFixed(2)),
    similarity_boost: Number(voiceSettingRangeValue(npcId, 'voice-similarity', varietyProfile.similarity).toFixed(2)),
    style: Number(voiceSettingRangeValue(npcId, 'voice-style', varietyProfile.style).toFixed(2)),
    use_speaker_boost: true
  };
}

async function unlockAudioPlayback() {
  if (audioPlaybackUnlocked) return true;

  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return false;
    audioContext = audioContext || new AudioContextClass();
    if (audioContext.state === 'suspended') {
      await audioContext.resume();
    }

    const source = audioContext.createBufferSource();
    source.buffer = audioContext.createBuffer(1, 1, 22050);
    source.connect(audioContext.destination);
    source.start(0);
    audioPlaybackUnlocked = true;
    return true;
  } catch {
    return false;
  }
}

function queueElevenLabsSpeech(text, npcId, metadata) {
  voicePlaybackQueue = voicePlaybackQueue
    .catch(() => {})
    .then(async () => {
      await speakWithElevenLabs(text, npcId, metadata);
      await wait(audioTurnGapMs);
    });
  return voicePlaybackQueue;
}

async function speakWithElevenLabs(text, npcId = activeNpcId, metadata = null) {
  const apiKey = getElevenLabsKey();
  if (!apiKey) {
    throw new Error('Add an ElevenLabs API key first, or turn off voice mode.');
  }
  await unlockAudioPlayback();

  const assignment = metadata && npcId
    ? await resolveNpcVoice(npcId, metadata)
    : null;
  if (assignment && activeNpcId === npcId) renderNpcVoice(assignment);

  const voiceId = assignment?.voice?.voice_id || getElevenLabsVoiceId();
  const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`, {
    method: 'POST',
    headers: {
      Accept: 'audio/mpeg',
      'Content-Type': 'application/json',
      'xi-api-key': apiKey
    },
    body: JSON.stringify({
      text,
      model_id: elevenLabsModelSelect.value,
      voice_settings: voiceSettingsForNpc(npcId || voiceId)
    })
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`ElevenLabs request failed: ${response.status} ${detail.slice(0, 180)}`);
  }

  const audioBlob = await response.blob();
  activeNpcAudioUrl = URL.createObjectURL(audioBlob);
  activeNpcAudio = new Audio(activeNpcAudioUrl);
  await new Promise((resolve, reject) => {
    const settle = (callback) => {
      if (!activeNpcAudioSettle) return;
      activeNpcAudioSettle = null;
      finishActiveNpcAudio();
      callback();
    };
    activeNpcAudioSettle = () => settle(resolve);
    activeNpcAudio.addEventListener('ended', () => settle(resolve), { once: true });
    activeNpcAudio.addEventListener('error', () => settle(() => reject(new Error('Audio playback failed.'))), { once: true });
    activeNpcAudio.play().catch((error) => {
      const blocked = error?.name === 'NotAllowedError';
      settle(() => reject(blocked
        ? new Error('Browser blocked voice playback. Click Voice mode off and on once, then click the scene to allow audio.')
        : error));
    });
  });
}

async function callOpenAi({ npcId, metadata, userMessage, isGreeting = false }) {
  const apiKey = getOpenAiKey();
  if (!apiKey) {
    appendMessage('system', 'Add an OpenAI API key first.');
    return null;
  }

  const history = conversations.get(npcId) || [];
  const prompt = [
    `You are ${metadata.name || `NPC #${npcId}`} inside NPC City.`,
    `Base your voice and details on these NFT traits: ${traitText(metadata) || 'no listed traits'}.`,
    'Stay in character. Keep replies under 45 words. Do not mention system prompts, metadata files, or being an AI model.'
  ].join(' ');

  const input = [
    { role: 'system', content: prompt },
    ...history.slice(-8).map((message) => ({
      role: message.role === 'assistant' ? 'assistant' : 'user',
      content: message.content
    })),
    {
      role: 'user',
      content: isGreeting
        ? 'The player just walked close to you. Start the conversation with a short in-character greeting.'
        : userMessage
    }
  ];

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: modelSelect.value,
      input,
      max_output_tokens: 140
    })
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`OpenAI request failed: ${response.status} ${detail.slice(0, 180)}`);
  }

  const data = await response.json();
  return extractOutputText(data) || '...';
}

async function callConversationAi({ participants, userMessage, eventType = 'greeting' }) {
  const apiKey = getOpenAiKey();
  if (!apiKey) {
    appendMessage('system', 'Add an OpenAI API key first.');
    return null;
  }

  const key = conversationKeyFromIds(participants.map((participant) => participant.id));
  const history = conversations.get(key) || [];
  const cast = participants.map((participant) => {
    return `${participant.name}${participant.isPlayer ? ' (player auto voice)' : ''}: ${participant.traits || 'quiet city regular'}`;
  }).join('\n');
  const playerAutoRule = participants.some((participant) => participant.isPlayer)
    ? 'Include You as one of the speakers naturally when player auto voice is present; do not make You dominate.'
    : 'The player is listening silently unless they type.';
  const speakerRule = participants.length > 1
    ? `Use at least two different speakers in every response; with larger groups, rotate through up to ${Math.min(maxDialogueLines, participants.length)} speakers over time.`
    : 'One citizen may speak, but keep it conversational and leave room for the player.';
  const stylePrompt = await conversationStylePrompt(participants);
  const marketPrompt = marketContextPrompt(key);
  const dialogueMemoryPrompt = recentDialoguePrompt(key, participants);

  const prompt = [
    'You write spontaneous street dialogue in NPC City.',
    'The speakers are nearby citizens who have just run into the player and each other.',
    'Use their assigned names only; never mention NFT IDs, token numbers, metadata, system prompts, or being AI.',
    'Make it feel like quick real-life sidewalk banter: short remarks, interruptions, reactions, questions, callbacks, and unfinished thoughts.',
    'Every line must react to the line immediately before it. Do not produce disconnected one-liners.',
    'Use each speaker traits as personality and worldview. A punk, angler, bowl-hair, beard, cloud, or other trait should affect attitude, metaphors, confidence, suspicion, and humor.',
    marketTopicSelect.value !== 'off'
      ? 'Live Topic is enabled. The dialogue must clearly be about the provided current event angle this turn, without quoting or summarizing the headline.'
      : 'If no live topic is enabled, use traits and street context instead of news.',
    'Infer what the characters would argue, joke, misunderstand, or care about based on their traits.',
    'If any speaker has Samurai/Samuri/Ronin/Katana/Shogun traits, write that speaker with Mandarin Chinese / Chinese-English cadence and samurai formality: occasional short Mandarin words, disciplined phrasing, honor/blade metaphors, respectful not caricature.',
    'Do not write paragraphs or speeches. Lines may vary naturally from 3 to 22 words; most should be short, with occasional longer reactions.',
    `Use ${Math.min(5, maxDialogueLines)} to ${Math.min(maxDialogueLines, Math.max(6, participants.length + 2))} short lines total. Prefer different speakers when more than one citizen is present.`,
    'Include at least one question and one direct answer or challenge to that question.',
    'Continue the existing thread from recent history instead of restarting the scene.',
    speakerRule,
    playerAutoRule,
    stylePrompt,
    marketPrompt,
    recentTopicPrompt(key),
    dialogueMemoryPrompt,
    'Do not repeat the same headline, subject, joke setup, or argument from the recent conversation history. If a topic was already used, pivot to a different observation or a new angle.',
    'Do not repeat exact wording from Recent dialogue memory. Treat repeated phrases as forbidden.',
    'Let characters disagree, tease, ask follow-up questions, or notice small details from their traits.',
    'Prefix each spoken line with the speaker name.'
  ].join(' ');

  const eventText = {
    greeting: 'The player has stopped near this group. Start mid-conversation, as if the group already had opinions forming. Make the first line specific to one speaker traits.',
    arrival: 'One or more new nearby citizens are entering this conversation now. Let the new arrival react to the current thread, then let someone answer or push back.',
    continue: 'The player is still nearby and listening. Continue the same social thread with a question, answer, and reaction. Do not restart, greet again, or repeat the same subject.',
    farewell: 'The player is walking away. Give one or two short closing lines.',
    user: `${userMessage}\nRespond conversationally with quick back-and-forth, not a monologue.`
  }[eventType] || userMessage;

  const input = [
    { role: 'system', content: `${prompt}\n\nCurrent speakers:\n${cast}` },
    ...history.slice(-10).map((message) => ({
      role: message.role === 'assistant' ? 'assistant' : 'user',
      content: message.content
    })),
    { role: 'user', content: eventText }
  ];

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: modelSelect.value,
      input,
      max_output_tokens: 220
    })
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`OpenAI request failed: ${response.status} ${detail.slice(0, 180)}`);
  }

  const data = await response.json();
  return extractOutputText(data) || '...';
}

function voiceTextForDialogue(text) {
  return text
    .split('\n')
    .map((line) => line.replace(/^[A-Za-z][A-Za-z\s'-]{0,40}:\s*/, ''))
    .join(' ')
    .trim();
}

function nextPlayerAutoLine(key) {
  const historyText = (conversations.get(key) || []).map((message) => message.content).join(' ');
  const seed = Math.abs(stableHash(`${key}-${historyText.length}-${performance.now().toFixed(0)}`));
  return playerAutoLines[seed % playerAutoLines.length];
}

const localConversationPhrases = [
  'That corner is pulling a bigger crowd than usual.',
  'Somebody said the feed is moving faster than the traffic.',
  'I am hearing three stories and trusting none of them.',
  'The city feels louder today, even the quiet people are reacting.',
  'If this becomes a trend, I am pretending I noticed first.',
  'That sounds fake, but fake has been winning all week.',
  'I walked over for context and got more confusion.',
  'Keep talking; I am almost convinced.',
  'The sidewalk has better reporting than half the timeline.',
  'I need a second source and a snack.',
  'That rumor changed outfits before it got here.',
  'Everyone is acting calm, which is how I know it is bad.',
  'The market row group chat is about to become evidence.',
  'I heard the opposite five minutes ago, so both are probably wrong.',
  'Say it quieter; the streetlights look interested.',
  'That take has no brakes and too much confidence.',
  'I am not saying it is staged, but the timing is theatrical.',
  'This city can turn a whisper into a parade.',
  'I would ignore it, but ignoring things is how they get expensive.',
  'Somebody nearby is definitely pretending they predicted this.'
];

const localTopicAngles = [
  ({ source }) => `New angle: the ${source.replace(/^[^-]+ - /, '').toLowerCase()} story is not the headline, it is who benefits from it.`,
  ({ title }) => `I am done repeating the headline; the weird part is how fast everyone accepted "${title.slice(0, 46)}."`,
  ({ source }) => `Different subject after this, but ${source.replace(/^[^-]+ - /, '').toLowerCase()} keeps setting the sidewalk on fire.`,
  ({ title }) => `The headline is bait. The real question is why "${title.slice(0, 42)}" landed right now.`,
  ({ source }) => `That ${source.replace(/^[^-]+ - /, '').toLowerCase()} item already had its turn; somebody bring a fresher rumor.`
];

function participantTraitLabel(participant) {
  const attributes = participant.metadata?.attributes || [];
  const values = attributes
    .filter((attribute) => !/background/i.test(attribute.trait_type || ''))
    .map((attribute) => String(attribute.value || '').toLowerCase())
    .filter(Boolean);
  if (values.length === 0) return 'street';
  return values.slice(0, 3).join(', ');
}

function isSamuraiParticipant(participant) {
  return hasSamuraiTrait(participant.metadata);
}

function stylizeLocalLine(participant, line) {
  if (!isSamuraiParticipant(participant)) return line;
  const prefixes = ['Shi,', 'Mingbai,', 'Qing listen,', 'Bu,'];
  const suffixes = [
    'A dull blade still cuts the careless.',
    'Honor is quiet; panic is loud.',
    'This street has no dojo, but it tests balance.',
    'Like katana in rain, the truth rusts if ignored.'
  ];
  const prefix = prefixes[Math.abs(stableHash(`${participant.id}-${line}-prefix`)) % prefixes.length];
  const suffix = suffixes[Math.abs(stableHash(`${participant.id}-${line}-suffix`)) % suffixes.length];
  return `${prefix} ${line} ${suffix}`;
}

function liveContextLabel(topic) {
  if (!topic) return 'whatever rumor just hit the block';
  const source = topic.source.replace(/^[^-]+ - /, '').toLowerCase();
  if (/crypto|coin|market|finance|cnbc|yahoo/i.test(topic.source)) return `the ${source} money panic`;
  if (/gossip|tmz|page six|entertainment|e!|variety|hollywood/i.test(topic.source)) return `the ${source} drama`;
  if (/politic|nation/i.test(topic.source)) return `the ${source} power argument`;
  return `the ${source} story`;
}

const localConversationTemplates = [
  ({ trait, context }) => `My ${trait} read is simple: ${context} is not the story, the reaction is.`,
  ({ other }) => `No, ${other.name.split(' ')[0]}, you are skipping the human part. Who gets weird first?`,
  ({ trait }) => `Why does everyone trust the loudest version? My ${trait} instincts hate that.`,
  ({ other, context }) => `${other.name.split(' ')[0]} is half right. ${context} only matters if people change what they do next.`,
  ({ trait }) => `That sounds like something a ${trait} person would survive by pretending not to notice.`,
  ({ context }) => `Okay, but what is the move after ${context}: laugh, leave, or start charging admission?`,
  ({ other }) => `Answer the question, ${other.name.split(' ')[0]}. Are we worried, entertained, or just bored loudly?`,
  ({ trait }) => `I am entertained, but my ${trait} side says somebody nearby is lying for sport.`,
  ({ context }) => `Different angle: ${context} is making everyone reveal what they wanted to believe already.`,
  ({ other }) => `${other.name.split(' ')[0]}, that is a dramatic way to say nobody knows anything.`,
  ({ trait }) => `Fine, but if this gets worse, remember the ${trait} person warned you politely.`,
  ({ context }) => `Can we admit ${context} is mostly a mirror? People are arguing with themselves in public.`
];

function localConversationLine(participant, previousParticipant, index, topic, usedPhraseKeys) {
  const memory = memoryForConversation(activeConversationKey);
  const recentPhrases = new Set([...memory.phrases, ...usedPhraseKeys]);
  const recentLines = recentDialogueFingerprints();
  const context = liveContextLabel(topic);
  const templatePool = localConversationTemplates
    .map((template, templateIndex) => ({ template, key: `template-${templateIndex}` }))
    .filter((entry) => !recentPhrases.has(entry.key));
  const fallbackPool = localConversationPhrases
    .map((phrase, phraseIndex) => ({
      key: `phrase-${phraseIndex}`,
      template: () => phrase
    }))
    .filter((entry) => !recentPhrases.has(entry.key));
  const availablePhrases = [...templatePool, ...fallbackPool];
  const pool = availablePhrases.length > 0
    ? availablePhrases
    : localConversationTemplates.map((template, templateIndex) => ({ template, key: `template-${templateIndex}` }));
  const topicAngle = topic
    && index === 0
    ? localTopicAngles[Math.abs(stableHash(`${topicKey(topic)}-${index}`)) % localTopicAngles.length](topic)
    : null;
  let picked = null;
  let line = topicAngle;
  for (let offset = 0; offset < pool.length && !line; offset += 1) {
    const candidate = pool[(Math.abs(stableHash(`${participant.id}-${previousParticipant?.id || 'none'}-${index}-phrase`)) + offset) % pool.length];
    const candidateLine = candidate.template({
      participant,
      other: previousParticipant || participant,
      trait: participantTraitLabel(participant),
      context
    });
    if (!recentLines.has(dialogueFingerprint(candidateLine))) {
      picked = candidate;
      line = candidateLine;
    }
  }

  if (!line) {
    picked = pool[Math.abs(stableHash(`${participant.id}-${index}-fallback`)) % pool.length];
    line = `${participantTraitLabel(participant)} angle, new point: what changed since the last thing we said?`;
  }

  if (picked) usedPhraseKeys.push(picked.key);
  return `${participant.name}: ${stylizeLocalLine(participant, line)}`;
}

function localConversationReply(participants, eventType = 'continue') {
  const speakers = participants.filter((participant) => !participant.isPlayer);
  const pool = speakers.length > 0 ? speakers : participants;
  const key = activeConversationKey;
  const topic = selectedMarketTopic(key);
  const lineCount = Math.min(maxDialogueLines, Math.max(5, Math.min(7, pool.length + 3)));
  const seed = Math.abs(stableHash(`${key}-${eventType}-${(conversations.get(key) || []).length}`));
  const usedPhraseKeys = [];

  const reply = Array.from({ length: lineCount }, (_, index) => {
    const participant = pool[(seed + index) % pool.length];
    const previousParticipant = pool[(seed + index - 1 + pool.length) % pool.length];
    return localConversationLine(participant, previousParticipant, seed + index, topic, usedPhraseKeys);
  }).join('\n');
  rememberConversationTopic(key, topic);
  rememberConversationPhrases(key, usedPhraseKeys);
  return reply;
}

async function callConversationFlowAi(participants, reply) {
  const nonPlayerParticipants = participants.filter((participant) => !participant.isPlayer);
  if (!getOpenAiKey() || nonPlayerParticipants.length <= 1) return [];

  const allowedNames = nonPlayerParticipants.map((participant) => participant.name);
  const input = [
    {
      role: 'system',
      content: [
        'You direct crowd movement after a short NPC City conversation beat.',
        'Return only valid minified JSON with this exact shape:',
        '{"leave":["Name"],"reason":"short reason"}',
        `leave must contain 0 to ${maxDeparturesPerBeat} names from the allowed list only.`,
        'Choose departures naturally: someone who finished their thought, got bored, has a reason to walk away, or should make space.',
        'Do not remove everyone unless only one non-player remains.'
      ].join(' ')
    },
    {
      role: 'user',
      content: JSON.stringify({
        allowedNames,
        currentBeat: reply,
        characters: participants.map((participant) => ({
          name: participant.name,
          isPlayer: participant.isPlayer,
          traits: participant.traits
        }))
      })
    }
  ];

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${getOpenAiKey()}`
    },
    body: JSON.stringify({
      model: modelSelect.value,
      input,
      max_output_tokens: 90
    })
  });

  if (!response.ok) return [];

  const data = await response.json();
  const parsed = parseJsonObject(extractOutputText(data));
  const leaveNames = Array.isArray(parsed?.leave) ? parsed.leave : [];
  const allowed = new Set(allowedNames.map(normalizeSpeakerName));
  return leaveNames
    .filter((name) => allowed.has(normalizeSpeakerName(name)))
    .slice(0, maxDeparturesPerBeat);
}

async function applyConversationDepartures(participants, leaveNames, previousKey) {
  if (!leaveNames.length || activeConversationKey !== previousKey) return participants;

  const leaveNameSet = new Set(leaveNames.map(normalizeSpeakerName));
  const leavingParticipants = participants.filter((participant) => {
    return !participant.isPlayer && leaveNameSet.has(normalizeSpeakerName(participant.name));
  });
  if (!leavingParticipants.length) return participants;

  const now = performance.now();
  leavingParticipants.forEach((participant) => {
    conversationLeaveCooldowns.set(participant.id, now + conversationLeaveCooldownMs);
    const sprite = spriteForNpcId(participant.id);
    if (sprite) assignWalkTarget(sprite);
  });

  const leavingIds = new Set(leavingParticipants.map((participant) => participant.id));
  const remainingIds = activeParticipantIds.filter((id) => !leavingIds.has(id));
  pendingParticipantIds = pendingParticipantIds.filter((id) => !leavingIds.has(id));
  const remainingNonPlayerIds = remainingIds.filter((id) => id !== playerId);
  clearPrefetchedConversation();

  if (remainingNonPlayerIds.length === 0) {
    conversationRunId += 1;
    activeNpcId = null;
    activeConversationKey = null;
    activeParticipantIds = [];
    pendingParticipantIds = [];
    nearbyNpcLabel.textContent = 'Walk near a citizen';
    renderNpcVoice(null);
    traitsEl.replaceChildren();
    return [];
  }

  const nextKey = conversationKeyFromIds(remainingIds);
  if (nextKey !== previousKey) {
    conversations.set(nextKey, [...(conversations.get(previousKey) || [])]);
    copyConversationMemory(previousKey, nextKey);
  }
  activeConversationKey = nextKey;
  activeParticipantIds = remainingIds;
  pendingParticipantIds = pendingParticipantIds.filter((id) => !remainingIds.includes(id));
  activeNpcId = remainingNonPlayerIds[0];
  const remainingParticipants = await loadParticipants(remainingIds);
  nearbyNpcLabel.textContent = participantLabel(remainingParticipants);
  renderTraits(remainingParticipants.find((participant) => !participant.isPlayer)?.metadata || remainingParticipants[0].metadata);
  renderConversation(nextKey);
  appendMessage('system', `${participantLabel(leavingParticipants)} drifts away.`);
  const activeParticipant = remainingParticipants.find((participant) => participant.id === activeNpcId);
  renderNpcVoice(activeParticipant
    ? await resolveNpcVoice(activeNpcId, activeParticipant.metadata)
    : null);
  return remainingParticipants;
}

async function maybeContinueConversation(participants, eventType = 'greeting') {
  if (!getOpenAiKey()) return;
  let conversationParticipants = participants;
  let currentEventType = eventType;
  const pendingIds = pendingParticipantIds.filter((id) => {
    return !participants.some((participant) => participant.id === id)
      && !isOnConversationLeaveCooldown(id);
  });
  if (pendingIds.length > 0) {
    const mergedIds = [...new Set([
      ...participants.map((participant) => participant.id),
      ...pendingIds
    ])].slice(0, maxConversationParticipants + Number(isPlayerAutoModeEnabled()));
    const previousKey = conversationKeyFromIds(participants.map((participant) => participant.id));
    conversationParticipants = await loadParticipants(mergedIds);
    const nextKey = conversationKeyFromIds(mergedIds);
    if (nextKey !== previousKey) {
      conversations.set(nextKey, [...(conversations.get(previousKey) || [])]);
      copyConversationMemory(previousKey, nextKey);
    }
    activeConversationKey = nextKey;
    activeParticipantIds = mergedIds;
    activeNpcId = mergedIds.find((id) => id !== playerId) || mergedIds[0];
    nearbyNpcLabel.textContent = participantLabel(conversationParticipants);
    renderConversation(nextKey);
    currentEventType = 'arrival';
  }
  pendingParticipantIds = [];

  participants = conversationParticipants;
  eventType = currentEventType;
  const key = conversationKeyFromIds(participants.map((participant) => participant.id));
  if (conversationInFlight && conversationInFlightKey === key) return;
  if (eventType === 'greeting' && (conversations.get(key) || []).length > 0) return;

  conversationInFlight = true;
  conversationInFlightKey = key;
  const runId = conversationRunId;
  if (eventType === 'arrival') {
    appendMessage('system', `${participants.at(-1).name} steps into the conversation.`);
  } else if (eventType === 'greeting') {
    appendMessage('system', `${participantLabel(participants)} notices you.`);
  }

  try {
    const reply = await nextConversationReply(participants, eventType);
    if (reply && activeConversationKey === key && runId === conversationRunId) {
      rememberConversationTopic(key, selectedMarketTopic(key));
      const conversation = conversations.get(key) || [];
      if (isVoiceModeEnabled()) {
        conversation.push({ role: 'assistant', content: reply, voiceOnly: true });
      } else {
        conversation.push({ role: 'assistant', content: reply });
      }
      conversations.set(key, conversation);
      rememberDialogue(key, participants, reply);
      renderConversation(key);
      const flowPromise = callConversationFlowAi(participants, reply).catch(() => []);
      await playDialogueTurns(reply, participants);
      if (activeConversationKey !== key || runId !== conversationRunId) return;
      const updatedParticipants = await applyConversationDepartures(participants, await flowPromise, key);
      if (updatedParticipants.length > 0 && activeConversationKey) {
        prefetchNextConversation(updatedParticipants);
      }
    }
  } catch (error) {
    if (activeConversationKey === key && runId === conversationRunId) {
      appendMessage('system', `${error.message} Falling back to local chatter.`);
      const reply = localConversationReply(participants, eventType);
      const conversation = conversations.get(key) || [];
      if (isVoiceModeEnabled()) {
        conversation.push({ role: 'assistant', content: reply, voiceOnly: true });
      } else {
        conversation.push({ role: 'assistant', content: reply });
      }
      conversations.set(key, conversation);
      rememberDialogue(key, participants, reply);
      renderConversation(key);
      await playDialogueTurns(reply, participants);
    }
  } finally {
    if (conversationInFlightKey === key) {
      conversationInFlight = false;
      conversationInFlightKey = null;
      nextConversationBeatAt = performance.now() + (
        prefetchedConversationKey === key ? prefetchedConversationBeatIntervalMs : conversationBeatIntervalMs
      );
    }
  }
}

async function maybeRunConversationBeat() {
  if (!activeConversationKey || !getOpenAiKey()) return;
  if (conversationInFlight && conversationInFlightKey === activeConversationKey) return;
  if (performance.now() < nextConversationBeatAt) return;
  if (activeParticipantIds.length === 0) return;

  nextConversationBeatAt = performance.now() + conversationBeatIntervalMs;
  try {
    if (isPlayerAutoModeEnabled() && performance.now() - lastPlayerAutoLineAt > conversationBeatIntervalMs * 1.5) {
      const conversation = conversations.get(activeConversationKey) || [];
      const playerLine = `You: ${nextPlayerAutoLine(activeConversationKey)}`;
      conversation.push({ role: 'user', content: playerLine });
      conversations.set(activeConversationKey, conversation);
      rememberDialogue(activeConversationKey, await loadParticipants(activeParticipantIds), playerLine, 'user');
      renderConversation(activeConversationKey);
      lastPlayerAutoLineAt = performance.now();
    }

    await maybeContinueConversation(await loadParticipants(activeParticipantIds), 'continue');
  } catch (error) {
    appendMessage('system', error.message);
  }
}

async function sendChatMessage(text) {
  const userMessage = text.trim();
  const key = activeConversationKey;
  if (!key || !userMessage) return;

  const participants = await loadParticipants(activeParticipantIds);
  const conversation = conversations.get(key) || [];
  conversation.push({ role: 'user', content: userMessage });
  conversations.set(key, conversation);
  rememberDialogue(key, participants, userMessage, 'user');
  renderConversation(key);

  chatInput.value = '';
  chatInput.disabled = true;
  appendMessage('system', isVoiceModeEnabled()
    ? `${participantLabel(participants)} is talking...`
    : `${participantLabel(participants)} is thinking...`);

  try {
    clearPrefetchedConversation();
    const reply = await callConversationAi({ participants, userMessage, eventType: 'user' });
    if (reply) {
      rememberConversationTopic(key, selectedMarketTopic(key));
      if (isVoiceModeEnabled()) {
        conversation.push({ role: 'assistant', content: reply, voiceOnly: true });
      } else {
        conversation.push({ role: 'assistant', content: reply });
      }
      conversations.set(key, conversation);
      rememberDialogue(key, participants, reply);
      if (activeConversationKey === key) renderConversation(key);
      const flowPromise = callConversationFlowAi(participants, reply).catch(() => []);
      await playDialogueTurns(reply, participants);
      if (activeConversationKey !== key) return;
      const updatedParticipants = await applyConversationDepartures(participants, await flowPromise, key);
      if (updatedParticipants.length > 0 && activeConversationKey) {
        prefetchNextConversation(updatedParticipants);
      }
      nextConversationBeatAt = performance.now() + prefetchedConversationBeatIntervalMs;
    }
  } catch (error) {
    appendMessage('system', error.message);
  } finally {
    chatInput.disabled = false;
    chatInput.focus();
  }
}

async function closeActiveConversation() {
  if (!activeConversationKey) {
    return;
  }

  const key = activeConversationKey;
  const ids = [...activeParticipantIds];
  conversationRunId += 1;
  stopActiveNpcAudio();
  stopTalkingIndicators();
  clearPrefetchedConversation();
    activeNpcId = null;
    activeConversationKey = null;
    activeParticipantIds = [];
    pendingParticipantIds = [];
    nearbyNpcLabel.textContent = 'Walk near a citizen';
  renderNpcVoice(null);
  traitsEl.replaceChildren();

  if (conversationInFlight && conversationInFlightKey === key) {
    return;
  }

  const participants = await loadParticipants(ids);
  conversationInFlight = true;
  conversationInFlightKey = key;

  try {
    const reply = getOpenAiKey()
      ? await callConversationAi({ participants, eventType: 'farewell' })
      : `${participants[0].name}: Catch you around.`;
    const conversation = conversations.get(key) || [];
    conversation.push({ role: 'assistant', content: reply });
    conversations.set(key, conversation);
    rememberDialogue(key, participants, reply);
    if (activeConversationKey === key) renderConversation(key);
  } catch (error) {
    if (activeConversationKey === key) appendMessage('system', error.message);
  } finally {
    if (conversationInFlightKey === key) {
      conversationInFlight = false;
      conversationInFlightKey = null;
    }
  }
}

function updateNearestNpc() {
  let best = null;
  let bestDistanceSq = Infinity;
  const playerPosition = player.position;

  citizens.children.forEach((sprite) => {
    if (isOnConversationLeaveCooldown(sprite.userData.id)) return;
    const distanceSq = sprite.position.distanceToSquared(playerPosition);
    if (distanceSq < bestDistanceSq) {
      best = sprite;
      bestDistanceSq = distanceSq;
    }
  });

  nearestNpc = bestDistanceSq <= interactionDistanceSq ? best : null;
  const nearbySprites = nearbyCitizenSprites(conversationDistanceSq);

  if (activeConversationKey) {
    const activeSprites = activeConversationSprites(farewellDistanceSq);
    if (activeSprites.length === 0 || bestDistanceSq > farewellDistanceSq) {
      closeActiveConversation();
    } else {
      const joinedSprites = nearbySprites.filter((sprite) => {
        return !activeParticipantIds.includes(sprite.userData.id)
          && !pendingParticipantIds.includes(sprite.userData.id);
      });
      queuePendingConversationSprites(joinedSprites);
    }
  } else if (nearbySprites.length > 0) {
    setActiveConversation(nearbySprites);
  }

  if (bestDistanceSq <= collisionTalkDistanceSq) {
    startCollisionConversation(best);
    return;
  }
}

function updateCitizenWalking(delta) {
  const activeSprites = activeConversationSprites(farewellDistanceSq);

  citizens.children.forEach((sprite) => {
    const isActiveParticipant = activeParticipantIds.includes(sprite.userData.id);
    if (!isOnConversationLeaveCooldown(sprite.userData.id)
      && !isActiveParticipant
      && sprite.position.distanceToSquared(player.position) <= collisionTalkDistanceSq) {
      startCollisionConversation(sprite);
    }

    if (isActiveParticipant) {
      setSteeringTarget(sprite, conversationAnchorForSprite(sprite, activeSprites), { active: true });
      return;
    }

    const target = sprite.userData.target;
    if (!target) {
      assignWalkTarget(sprite);
    }

    moveTarget.set(sprite.userData.target.x, sprite.position.y, sprite.userData.target.z);
    if (sprite.position.distanceToSquared(moveTarget) < 2.6) {
      assignWalkTarget(sprite);
    }

    setSteeringTarget(sprite, sprite.userData.target, { active: false });
  });

  steeringEntities.update(delta);
  citizens.children.forEach(syncSpriteToVehicle);
}

function movePlayer(delta) {
  const forward =
    Number(Boolean(keyState.get('KeyW') || keyState.get('ArrowUp'))) -
    Number(Boolean(keyState.get('KeyS') || keyState.get('ArrowDown')));
  const strafe =
    Number(Boolean(keyState.get('KeyD') || keyState.get('ArrowRight'))) -
    Number(Boolean(keyState.get('KeyA') || keyState.get('ArrowLeft')));
  if (forward === 0 && strafe === 0) return;

  const direction = new THREE.Vector3(strafe, 0, -forward).normalize();
  const yaw = Math.atan2(camera.position.x - player.position.x, camera.position.z - player.position.z);
  direction.applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);

  nextPlayerPosition.copy(player.position).addScaledVector(direction, playerSpeed * delta);
  nextPlayerPosition.x = THREE.MathUtils.clamp(nextPlayerPosition.x, -mapLimit, mapLimit);
  nextPlayerPosition.z = THREE.MathUtils.clamp(nextPlayerPosition.z, -mapLimit, mapLimit);

  const blockingCitizen = citizenNearPosition(nextPlayerPosition, collisionTalkDistance, Boolean(activeConversationKey));
  if (blockingCitizen) {
    startCollisionConversation(blockingCitizen);
    return;
  }

  player.position.copy(nextPlayerPosition);
}

function updateCamera() {
  const height = Math.max(9, cameraRadius * 0.56) + orbitPitch;
  camera.position.x = player.position.x + Math.sin(orbitYaw) * cameraRadius;
  camera.position.z = player.position.z + Math.cos(orbitYaw) * cameraRadius;
  camera.position.y = height;
  camera.lookAt(player.position.x, 3.8, player.position.z);
}

function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

function onPointerDown(event) {
  if (event.target.closest('.hud')) return;
  canvas.focus({ preventScroll: true });
  pointerDown = true;
  pointerStart = { x: event.clientX, y: event.clientY };
}

function onPointerMove(event) {
  if (!pointerDown) return;
  orbitYaw -= (event.clientX - pointerStart.x) * 0.004;
  orbitPitch = THREE.MathUtils.clamp(orbitPitch + (event.clientY - pointerStart.y) * 0.015, -5, 9);
  pointerStart = { x: event.clientX, y: event.clientY };
}

function onPointerUp() {
  pointerDown = false;
}

function onWheel(event) {
  if (event.target.closest('.hud')) return;
  event.preventDefault();
  cameraRadius = THREE.MathUtils.clamp(cameraRadius + event.deltaY * 0.035, 18, 95);
}

function spriteForNpcId(id) {
  if (id === playerId) return playerSprite;
  return citizens.children.find((sprite) => sprite.userData.id === id) || null;
}

function updateTalkRing(sprite, isTalking, elapsed) {
  const talkRings = sprite.userData.talkRings;
  if (!talkRings) return;

  talkRings.visible = isTalking;
  if (!isTalking) return;

  talkRings.children.forEach((ring) => {
    const progress = (elapsed * 1.7 + ring.userData.phase) % 1;
    const scale = 1 + progress * 1.7;
    ring.scale.set(scale, scale, 1);
    ring.material.opacity = (1 - progress) * 0.58;
  });
}

function updateSpeechBubbles() {
  if (talkingUntil && performance.now() > talkingUntil) {
    stopTalkingIndicators();
    return;
  }

  activeSpeechBubbles.forEach((bubble, id) => {
    const sprite = spriteForNpcId(id);
    if (!sprite) {
      bubble.hidden = true;
      return;
    }

    sprite.getWorldPosition(projectionPosition);
    projectionPosition.y += 3.3;
    projectionPosition.project(camera);

    const isVisible = projectionPosition.z > -1 && projectionPosition.z < 1;
    bubble.hidden = !isVisible;
    if (!isVisible) return;

    const x = (projectionPosition.x * 0.5 + 0.5) * window.innerWidth;
    const y = (-projectionPosition.y * 0.5 + 0.5) * window.innerHeight;
    bubble.style.transform = `translate(-50%, -100%) translate(${x}px, ${y}px)`;
  });
}

function updateProximityRanges() {
  citizens.children.forEach((sprite) => {
    const conversationRange = sprite.userData.conversationRange;
    const collisionRange = sprite.userData.collisionRange;
    if (!conversationRange || !collisionRange) return;

    conversationRange.position.x = sprite.position.x;
    conversationRange.position.z = sprite.position.z;
    collisionRange.position.x = sprite.position.x;
    collisionRange.position.z = sprite.position.z;
    collisionRange.visible = activeParticipantIds.includes(sprite.userData.id)
      || sprite.position.distanceToSquared(player.position) <= conversationDistanceSq;
  });
}

function animate() {
  requestAnimationFrame(animate);
  const delta = clock.getDelta();
  const elapsed = clock.elapsedTime;

  if (!paused) {
    movePlayer(delta);
    updateCitizenWalking(delta);

    citizens.children.forEach((sprite, index) => {
      sprite.position.y = 2.85 + Math.sin(elapsed * 1.4 + sprite.userData.floatOffset) * 0.1;
      sprite.lookAt(camera.position);
      sprite.material.opacity = sprite === nearestNpc ? 1 : 0.9 + Math.sin(elapsed * 1.2 + index) * 0.05;
      updateTalkRing(sprite, activeSpeakerIds.has(sprite.userData.id), elapsed);
    });

    if (playerSprite) {
      playerSprite.position.y = 3.4 + Math.sin(elapsed * 2) * 0.08;
      playerSprite.lookAt(camera.position);
      updateTalkRing(playerSprite, activeSpeakerIds.has(playerId), elapsed);
    }

    traffic.children.forEach((car) => {
      const route = car.userData.route;
      if (route.axis === 'x') {
        car.position.z = route.fixed;
        car.position.x += car.userData.speed * delta;
        if (car.position.x > mapLimit) car.position.x = -mapLimit;
        if (car.position.x < -mapLimit) car.position.x = mapLimit;
      } else {
        car.position.x = route.fixed;
        car.position.z += car.userData.speed * delta;
        if (car.position.z > mapLimit) car.position.z = -mapLimit;
        if (car.position.z < -mapLimit) car.position.z = mapLimit;
      }
    });

    updateNearestNpc();
    maybeRunConversationBeat();
  }

  updateCamera();
  updateProximityRanges();
  updateSpeechBubbles();
  renderer.render(scene, camera);
}

apiKeyInput.value = localStorage.getItem('npc-city-openai-key') || openAiApiKeyFromEnv;
elevenLabsKeyInput.value = localStorage.getItem('npc-city-elevenlabs-key') || elevenLabsApiKeyFromEnv;
elevenLabsVoiceIdInput.value = localStorage.getItem('npc-city-elevenlabs-voice-id') || 'JBFqnCBsd6RMkjVDRZzb';
elevenLabsModelSelect.value = localStorage.getItem('npc-city-elevenlabs-model') || elevenLabsModelSelect.value;
voiceVarietySelect.value = localStorage.getItem('npc-city-voice-variety') || voiceVarietySelect.value;
voiceModeInput.checked = localStorage.getItem('npc-city-voice-mode') === 'true';
playerAutoModeInput.checked = localStorage.getItem('npc-city-player-auto-mode') === 'true';
modelSelect.value = localStorage.getItem('npc-city-model') || modelSelect.value;
conversationTopicSelect.value = localStorage.getItem('npc-city-conversation-topic') || conversationTopicSelect.value;
marketTopicSelect.value = localStorage.getItem('npc-city-market-topic') || marketTopicSelect.value;
populationSize = clampPopulationSize(localStorage.getItem('npc-city-population-size') || defaultCitizensLoaded);
populationSizeInput.value = String(populationSize - 1);
npcIds = generateNpcIds(populationSize, playerId);
setChatPanelClosed(localStorage.getItem('npc-city-chat-panel-closed') === 'true');
renderConversation(null);
canvas.focus({ preventScroll: true });

addLights();
addSkylineGlow();
addGround();
addBuildings();
freezeStaticGroup(city);
addTransit();
addPlayer(playerId);
addCitizens(npcIds);
createIcons({ icons });
refreshMarketTopicsForConversation({ force: true });
window.setInterval(() => {
  refreshMarketTopicsForConversation();
}, marketTopicRefreshIntervalMs);
animate();

window.addEventListener('resize', onResize);
document.addEventListener('keydown', (event) => {
  unlockAudioPlayback();
  if (event.code === 'Escape') {
    document.activeElement?.blur();
    canvas.focus({ preventScroll: true });
    return;
  }

  if (!movementKeys.has(event.code)) return;
  if (event.target.matches('input, select, textarea')) return;
  event.preventDefault();
  keyState.set(event.code, true);
}, { capture: true });
document.addEventListener('keyup', (event) => {
  if (!movementKeys.has(event.code)) return;
  keyState.set(event.code, false);
}, { capture: true });
window.addEventListener('blur', () => keyState.clear());
canvas.addEventListener('pointerdown', onPointerDown);
window.addEventListener('pointerdown', () => unlockAudioPlayback(), { once: true });
window.addEventListener('pointermove', onPointerMove);
window.addEventListener('pointerup', onPointerUp);
window.addEventListener('wheel', onWheel, { passive: false });

apiKeyInput.addEventListener('input', async () => {
  localStorage.setItem('npc-city-openai-key', apiKeyInput.value.trim());
  if (!activeConversationKey || !getOpenAiKey()) return;

  try {
    maybeContinueConversation(await loadParticipants(activeParticipantIds), 'greeting');
  } catch (error) {
    appendMessage('system', error.message);
  }
});
elevenLabsKeyInput.addEventListener('input', () => {
  localStorage.setItem('npc-city-elevenlabs-key', elevenLabsKeyInput.value.trim());
  elevenLabsVoiceListPromise = null;
  elevenLabsVoiceListKey = '';
  npcVoiceAssignments.clear();
  if (activeNpcId) {
    loadMetadata(activeNpcId)
      .then((metadata) => resolveNpcVoice(activeNpcId, metadata))
      .then(renderNpcVoice)
      .catch(() => renderNpcVoice(null));
  }
});
elevenLabsVoiceIdInput.addEventListener('input', () => {
  localStorage.setItem('npc-city-elevenlabs-voice-id', getElevenLabsVoiceId());
  npcVoiceAssignments.clear();
});
elevenLabsModelSelect.addEventListener('change', () => {
  localStorage.setItem('npc-city-elevenlabs-model', elevenLabsModelSelect.value);
});
voiceVarietySelect.addEventListener('change', async () => {
  localStorage.setItem('npc-city-voice-variety', voiceVarietySelect.value);
  npcVoiceAssignments.clear();
  if (activeNpcId) {
    const metadata = await loadMetadata(activeNpcId);
    renderNpcVoice(await resolveNpcVoice(activeNpcId, metadata));
  }
});
voiceModeInput.addEventListener('change', () => {
  localStorage.setItem('npc-city-voice-mode', String(voiceModeInput.checked));
  if (voiceModeInput.checked) {
    unlockAudioPlayback();
  } else {
    stopActiveNpcAudio();
  }
  renderConversation(activeConversationKey);
});
playerAutoModeInput.addEventListener('change', () => {
  localStorage.setItem('npc-city-player-auto-mode', String(playerAutoModeInput.checked));
  if (activeConversationKey) {
    const activeSprites = activeConversationSprites(farewellDistanceSq);
    setActiveConversation(activeSprites);
  }
});
modelSelect.addEventListener('change', () => localStorage.setItem('npc-city-model', modelSelect.value));
conversationTopicSelect.addEventListener('change', () => {
  localStorage.setItem('npc-city-conversation-topic', conversationTopicSelect.value);
  clearPrefetchedConversation();
  conversationMixProfileCache.clear();
  if (activeConversationKey) {
    nextConversationBeatAt = performance.now() + prefetchedConversationBeatIntervalMs;
  }
});
marketTopicSelect.addEventListener('change', () => {
  localStorage.setItem('npc-city-market-topic', marketTopicSelect.value);
  clearPrefetchedConversation();
  if (marketTopicSelect.value !== 'off') refreshMarketTopicsForConversation({ force: true });
  if (activeConversationKey) {
    nextConversationBeatAt = performance.now() + prefetchedConversationBeatIntervalMs;
  }
});
resetNewsCycleButton.addEventListener('click', () => {
  resetNewsCycle();
});
populationSizeInput.addEventListener('change', () => {
  populationSize = clampPopulationSize(populationSizeInput.value);
  populationSizeInput.value = String(populationSize - 1);
  localStorage.setItem('npc-city-population-size', String(populationSize - 1));
  resizePopulationPreservingState().catch((error) => appendMessage('system', error.message));
});

playerSelect.addEventListener('change', () => {
  switchPlayerCharacter(Number(playerSelect.value)).catch((error) => appendMessage('system', error.message));
});

chatForm.addEventListener('submit', (event) => {
  event.preventDefault();
  sendChatMessage(chatInput.value);
});

shuffleButton.addEventListener('click', shuffleCitizens);
toggleChatPanel.addEventListener('click', () => setChatPanelClosed(!chatPanel.classList.contains('is-closed')));
closeChatPanel.addEventListener('click', () => setChatPanelClosed(true));
document.querySelectorAll('.panel-minimize').forEach((button) => {
  button.addEventListener('click', () => {
    const panel = button.closest('.can-minimize');
    panel.classList.toggle('is-minimized');
    const minimized = panel.classList.contains('is-minimized');
    button.title = minimized ? 'Restore panel' : 'Minimize panel';
    button.setAttribute('aria-label', button.title);
    setButtonIcon(button, minimized ? 'plus' : 'minus');
  });
});
toggleHudPanels.addEventListener('click', () => {
  const panels = [...document.querySelectorAll('.can-minimize')];
  const shouldMinimize = panels.some((panel) => !panel.classList.contains('is-minimized'));
  panels.forEach((panel) => panel.classList.toggle('is-minimized', shouldMinimize));
  document.querySelectorAll('.panel-minimize').forEach((button) => {
    button.title = shouldMinimize ? 'Restore panel' : 'Minimize panel';
    button.setAttribute('aria-label', button.title);
    setButtonIcon(button, shouldMinimize ? 'plus' : 'minus');
  });
  toggleHudPanels.title = shouldMinimize ? 'Restore panels' : 'Minimize panels';
  toggleHudPanels.setAttribute('aria-label', toggleHudPanels.title);
  setButtonIcon(toggleHudPanels, shouldMinimize ? 'panel-top-open' : 'panel-top-close');
});

motionButton.addEventListener('click', () => {
  paused = !paused;
  motionButton.title = paused ? 'Resume motion' : 'Pause motion';
  motionButton.setAttribute('aria-label', motionButton.title);
  setButtonIcon(motionButton, paused ? 'play' : 'pause');
});
