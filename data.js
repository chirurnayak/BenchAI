/* ===================================================================
   Bench — mock Resource Registry (Data Model)
   In a real deployment this would be a database. Here it's an
   in-memory dataset plus localStorage for anything the user creates
   (requests, registrations) so the demo persists across reloads.
=================================================================== */

// Student's "home" building, used for location-aware ranking.
const STUDENT_BUILDING = "Sinha Hall";

// Simple distance table between buildings (in "buildings away").
const CAMPUS_DISTANCES = {
  "Sinha Hall": 0,
  "ECE Block": 1,
  "Maker Lab": 1,
  "Central Library": 2,
  "Design Studio": 2,
  "Physics Annex": 3,
  "Sports Complex": 4,
};

function distanceFrom(building) {
  return CAMPUS_DISTANCES[building] ?? 3;
}

// availability: array of { day: "today"|"tomorrow"|"this-week", slots: [...] }
const RESOURCE_REGISTRY = [
  {
    id: "eq-scope-01",
    type: "equipment",
    category: "equipment",
    name: "Tektronix TBS1052B Oscilloscope",
    owner: "ECE Equipment Room",
    location: "ECE Block",
    keywords: ["oscilloscope", "scope", "signal", "circuit", "lab report", "waveform"],
    eligibility: "booking", // open | booking | approval
    freeNow: true,
    slots: ["Today 4:00–6:00 PM", "Tomorrow 9:00–11:00 AM", "Tomorrow 2:00–4:00 PM"],
  },
  {
    id: "eq-scope-02",
    type: "equipment",
    category: "equipment",
    name: "Rigol DS1054Z Oscilloscope",
    owner: "Physics Annex Lab",
    location: "Physics Annex",
    keywords: ["oscilloscope", "scope", "signal", "waveform"],
    eligibility: "approval",
    freeNow: false,
    slots: ["Tomorrow 11:00 AM–1:00 PM"],
  },
  {
    id: "eq-printer-01",
    type: "equipment",
    category: "equipment",
    name: "Prusa MK4 3D Printer",
    owner: "Maker Lab",
    location: "Maker Lab",
    keywords: ["3d printer", "print", "prototype", "maker"],
    eligibility: "approval",
    freeNow: true,
    slots: ["Today 6:00–9:00 PM", "Friday 10:00 AM–1:00 PM"],
  },
  {
    id: "eq-multimeter-01",
    type: "equipment",
    category: "equipment",
    name: "Fluke 87V Multimeter (set of 6)",
    owner: "ECE Equipment Room",
    location: "ECE Block",
    keywords: ["multimeter", "circuit", "voltage", "lab report"],
    eligibility: "open",
    freeNow: true,
    slots: ["Walk-in, no booking needed"],
  },
  {
    id: "sp-quiet-01",
    type: "space",
    category: "space",
    name: "Silent Study Pod B4",
    owner: "Central Library",
    location: "Central Library",
    keywords: ["quiet", "study", "room", "focus", "silent", "podcast", "record"],
    eligibility: "open",
    freeNow: true,
    slots: ["Free now", "Tonight 7:00–10:00 PM"],
  },
  {
    id: "sp-record-01",
    type: "space",
    category: "space",
    name: "Recording Booth, Media Studio",
    owner: "Design Studio",
    location: "Design Studio",
    keywords: ["podcast", "record", "audio", "quiet", "microphone"],
    eligibility: "booking",
    freeNow: true,
    slots: ["Tonight 8:00–9:00 PM", "Tomorrow 5:00–6:00 PM"],
  },
  {
    id: "sp-group-01",
    type: "space",
    category: "space",
    name: "Group Study Room 3C",
    owner: "Central Library",
    location: "Central Library",
    keywords: ["room", "study", "group", "meeting", "project"],
    eligibility: "open",
    freeNow: false,
    slots: ["Tomorrow 3:00–5:00 PM"],
  },
  {
    id: "sp-robotics-01",
    type: "space",
    category: "space",
    name: "Robotics Lab Bench",
    owner: "Maker Lab",
    location: "Maker Lab",
    keywords: ["robotics", "bench", "lab", "build"],
    eligibility: "approval",
    freeNow: true,
    slots: ["Friday 9:00 AM–6:00 PM"],
  },
];

// People / skills registry — the separate matching path for peer & mentor requests.
const PEOPLE_REGISTRY = [
  {
    id: "pp-01",
    type: "person",
    category: "skill",
    name: "Arjun Rao",
    role: "4th-year ECE, club lead",
    location: "ECE Block",
    keywords: ["solder", "pcb", "soldering", "circuit", "electronics"],
    eligibility: "open",
    freeNow: true,
    slots: ["Drop-in hours: Tue & Thu, 5–7 PM"],
  },
  {
    id: "pp-02",
    type: "person",
    category: "skill",
    name: "Dr. Meenakshi Iyer",
    role: "Faculty, Signals & Systems",
    location: "ECE Block",
    keywords: ["oscilloscope", "signal", "circuit", "mentor", "faculty"],
    eligibility: "approval",
    freeNow: false,
    slots: ["Office hours: Wed 2–4 PM"],
  },
  {
    id: "pp-03",
    type: "person",
    category: "skill",
    name: "Dev Malhotra",
    role: "3rd-year, Maker Club",
    location: "Maker Lab",
    keywords: ["3d printer", "cad", "maker", "prototype"],
    eligibility: "open",
    freeNow: true,
    slots: ["Available now in Maker Lab"],
  },
  {
    id: "pp-04",
    type: "person",
    category: "skill",
    name: "Sana Kapoor",
    role: "Teaching Assistant, Audio Engineering",
    location: "Design Studio",
    keywords: ["podcast", "record", "audio", "mixing"],
    eligibility: "open",
    freeNow: true,
    slots: ["Today 4–6 PM, Design Studio"],
  },
];

const SKILL_CHIPS = ["soldering", "3D printing", "oscilloscope basics", "audio recording", "CAD", "robotics"];

// ---- persistence helpers (localStorage, purely for this demo) ----
const STORE_KEY = "bench_demo_state_v1";

function loadState() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) { /* ignore corrupt state */ }
  return { requests: [], notifications: [], registrations: [] };
}

function saveState(state) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); }
  catch (e) { /* storage unavailable, demo continues in memory */ }
}
