<div align="center">

# RESQ.AI

**Citizens report disasters up. The control room sees them first.**

[![Languages](https://img.shields.io/badge/speaks-EN%20%C2%B7%20HI%20%C2%B7%20AS%20%C2%B7%20BN-2F6FDB)](#)
[![Offline](https://img.shields.io/badge/works-with%20no%20network-5A0FC8?logo=pwa&logoColor=white)](#when-the-network-dies)

[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white)](#)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)](#)
[![Express](https://img.shields.io/badge/Express-4-000000?logo=express&logoColor=white)](#)
[![Supabase](https://img.shields.io/badge/Supabase-3FCF8E?logo=supabase&logoColor=white)](#)

</div>

<!-- Screenshots go here:
<p align="center">
  <img src="docs/citizen.png" width="260" alt="Citizen app">
  <img src="docs/control-room.png" width="560" alt="Control room">
</p>
-->

<br>

When a flood hits, the government already has a way to warn people. What it doesn't have is a way to **hear back** — from the family on the roof, the road that just went under, the embankment that broke ten minutes ago.

RESQ.AI is that way back.

Anyone caught in a disaster can report what they see — a flooded road, a collapsed wall, people trapped — in English and more , with a photo and their location. Every report is read, sorted by how serious it is, and given a trust score before it reaches a live control room, where officers see the most urgent, most believable reports first and can verify, dispatch and resolve them. And because disasters take networks down, a report waits on the phone until there's signal, or hops to a neighbour's phone that has it.

```mermaid
flowchart LR
  subgraph today["Today · SACHET"]
    direction TB
    g1["🏛️ Government"] --> a1["📢 Alert"] --> c1["📱 Citizens"]
  end

  subgraph resq["RESQ.AI"]
    direction TB
    c2["🧍 Citizen on the ground"] --> r2["📝 Report"]
    r2 --> f2["🧠 Checked & scored"]
    f2 --> k2["🚨 Control room acts"]
  end

  today ~~~ resq
```

<br>

## The whole thing in one picture

```mermaid
mindmap
  root((RESQ.AI))
    Report
      Tap a hazard
      Any of 4 languages
      Photo and GPS
      Voice input
    Reach
      Works with no network
      Phone-to-phone relay
      Never counted twice
    Judge
      How bad is it
      Trust score 0–100
      Reused-photo check
      Do others nearby agree
    Act
      Priority queue
      Map and alarm
      Verify · dispatch · resolve
      Citizen sees the status
```

Four verbs. Everything RESQ.AI does is one of them.

<br>

## How a report travels

```mermaid
flowchart LR
  subgraph phone["📱 Citizen's phone"]
    form["Report<br/>hazard · words · photo · GPS"] --> net{"Signal?"}
    net -- yes --> send["Send"]
    net -- no --> outbox[("Waits on<br/>the phone")]
    outbox -- signal back --> send
    outbox -- "QR code" --> other[("Neighbour's<br/>phone")]
    other --> send
  end

  send --> api["🧠 RESQ.AI<br/>reads · scores · fingerprints"]
  api --> db[("Reports")]
  db --> control["🚨 Control room"]
  control -- "verify · dispatch · resolve" --> api
```

<details>
<summary><b>Zoom in on a single report</b></summary>

<br>

```mermaid
sequenceDiagram
  autonumber
  actor C as Citizen
  participant P as Phone
  participant S as RESQ.AI
  actor O as Officer

  C->>P: Taps Flood, writes a line, adds a photo
  P->>P: "4 km east of Jorhat"
  P->>S: Sends it
  S->>S: Language, severity, hazard
  S->>S: Two others nearby agree → trust 83
  S-->>P: High · Flood · Strong
  S-->>O: Top of the queue, alarm sounds
  O->>S: Verify → Dispatch
  S-->>P: "Dispatched"
```

</details>

<br>

## Can you trust a stranger's report?

That's the first question any officer asks. So every report gets a **trust score** before anyone sees it — with the reasons shown.

```mermaid
flowchart LR
  start(["Starts at 70"]) --> sig

  subgraph sig["Signals"]
    direction TB
    up["⬆ Others nearby agree +12/+22<br/>⬆ New photo +8<br/>⬆ Detailed +6"]
    down["⬇ Reused photo −30<br/>⬇ Test-like text −30<br/>⬇ Burst from one phone −25<br/>⬇ No usable GPS −20"]
  end

  sig --> score(["0–100"])
  score --> s1["Strong · act"]
  score --> s2["Fair · look for backup"]
  score --> s3["Weak · check first"]
  score --> s4["Suspect · likely noise"]

  classDef strong fill:#1f7a3f,stroke:#1f7a3f,color:#ffffff
  classDef fair fill:#c9a227,stroke:#c9a227,color:#1a1a1a
  classDef weak fill:#d9731a,stroke:#d9731a,color:#ffffff
  classDef suspect fill:#c0392b,stroke:#c0392b,color:#ffffff
  class s1 strong
  class s2 fair
  class s3 weak
  class s4 suspect
```

A reused photo gets caught even after it's been resized or recompressed. Five reports from one phone in ten minutes get flagged. Three people within 5 km saying the same thing push a report to the top.

Severity says how bad. Trust says how sure. Together they tell an officer where to look first.

```mermaid
quadrantChart
  title Where each report lands
  x-axis Low trust --> High trust
  y-axis Minor --> Life at risk
  quadrant-1 Act now
  quadrant-2 Verify first
  quadrant-3 Likely noise
  quadrant-4 Keep an eye on it
  Family on a roof - 3 agree: [0.8, 0.9]
  Bridge cracking - detailed: [0.72, 0.68]
  Reused flood photo: [0.14, 0.8]
  Burst of 6 from one phone: [0.26, 0.6]
  Road waterlogged: [0.78, 0.26]
  Drain blocked: [0.6, 0.14]
  Keyboard-mash test: [0.08, 0.1]
```

<details>
<summary><b>Every signal and its weight</b></summary>

<br>

| Signal | Points |
|---|---:|
| 3+ other reports within 5 km, last 6 h | **+22** |
| 1–2 other reports within 5 km, last 6 h | **+12** |
| Photo never seen before | **+8** |
| Detailed description | **+6** |
| Relayed phone-to-phone | 0 |
| Photo couldn't be read | −3 |
| No photo | −5 |
| Too little detail | −15 |
| No usable coordinates · copy-pasted text | −20 |
| Burst from one phone · coordinates 0,0 | −25 |
| Reused photo · test-like text | −30 |
| Outside India | −35 |

</details>

Once it lands, an officer moves it along — and the citizen watches it happen on their own phone.

```mermaid
stateDiagram-v2
  direction LR
  [*] --> pending
  pending --> verified
  verified --> dispatched
  dispatched --> resolved
  pending --> dismissed
  resolved --> pending: reopen
  dismissed --> pending: reopen
```

<br>

## When the network dies

Which, in a disaster, it will. The report waits on the phone — photo and all — and leaves the moment there's signal. Or it hops to a phone that has signal, by QR code.

```mermaid
sequenceDiagram
  participant A as Phone A · no signal
  participant B as Phone B
  participant S as RESQ.AI

  A->>B: Shows the report as a QR code
  B->>S: Finds signal first, sends it
  S-->>B: Stored · marked "mesh"
  A->>S: Hours later, sends it too
  S-->>A: Already have it — no duplicate
```

The app itself opens with no network at all.

> [!IMPORTANT]
> This is a phone-to-phone relay, one hop at a time. A true Bluetooth mesh — phones finding each other and passing reports on by themselves — can't run in a web browser, and it's the first thing on the list below.

<br>

<br>

## What's next

- [x] Report in four languages, online or off
- [x] Phone-to-phone relay by QR code
- [x] Trust score with reasons, reused-photo detection
- [x] Live control room with map, alerts and actions
- [ ] True multi-hop mesh on Android (Bluetooth + Wi-Fi Direct)
- [ ] Individual officer accounts
- [ ] AI model classification switched on
- [ ] SMS alerts to responders
- [ ] More languages

<br>

<div align="center">
<sub>On the one day the network works, RESQ.AI is a form. On every other day, it's how the message gets out.</sub>
</div>
