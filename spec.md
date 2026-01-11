# Romulus - Complete Game Specification

## Game Overview

Romulus is a real-time strategy game where players compete for total domination on a hexagonal grid. Players manage population across three roles—Labour, Military, and Spies—to generate resources, conquer territory, and undermine opponents.

**Players:** 2-8
**Session length:** 30 minutes to 2 hours
**Platform:** Browser-based multiplayer

### Core Concept

A real-time strategy game where every person in your empire is a choice: worker, soldier, or spy. Soldiers conquer openly—you see them coming, they see you. Spies conquer invisibly—cities turn before anyone knows why. You never have enough people for both. Neither does anyone else.

---

## Win Conditions

A player wins by achieving **total domination**—being the last player remaining.

**Elimination occurs when:**
- Player's capital is captured, OR
- Player's debt reaches -50 gold

**Alliance note:** Allies cannot win together. Only one player can win. The game does not force alliance-breaking—social pressure determines when allies turn on each other.

---

## Server Architecture

### Tick System
- **Tick rate:** 1 tick per second
- All game state calculations happen on each tick
- Server-authoritative: server decides all outcomes
- Pure server state: no client-side prediction

### Session Management
- Single-session only (no save/resume)
- No spectating (prevents information leaking to allies)

### Disconnection Handling
- Game pauses globally for all players when someone disconnects
- Maximum 30 seconds total pause time per player per game
- Auto-unpause after 30 seconds
- Player can reconnect during pause
- No AI takeover
- During pause: no player can take any actions

---

## Map System

### Grid Type
- Hexagonal grid
- Size scales automatically with player count (~8×8 equivalent for reference)
- Starting positions are fixed, evenly distributed, assigned randomly at game start

### Tile States

| Tile State | Description | Properties |
|------------|-------------|------------|
| Unexplored | Hidden from player | Not visible at all |
| Empty hill | Visible, unoccupied | Can be captured by military walking in |
| Occupied hill | Controlled by a player, no city | Military can be stationed here; no pop cap contribution |
| City | Controlled, has city built | +20 pop cap; can station military |
| Capital | Player's main city | +50 pop cap; loss = elimination |
| NPC city | Ownerless city | Acts like uncaptured hill; military can walk in to capture |

### Fog of War

**Vision rules:**
- Only tiles adjacent to owned cities/hills are visible
- Previously seen tiles show last known state with a fog overlay
- Vision is lost immediately when a city/hill is lost
- Everything is hidden by default at game start
- When a new city is discovered, all its properties are hidden until scouted

**What's hidden about other players:**
- Population counts
- Army positions (unless in your vision)
- Gold reserves
- All stats and upgrades
- Spy positions (spies are always invisible)

---

## Population System

### Starting Conditions
- **Starting population:** 20
- **Starting assignment:** All assigned to Labour
- **Starting location:** 1 capital city
- **Starting vision:** Capital + 6 adjacent hexes

### Population Cap

| City Type | Cap Contribution |
|-----------|------------------|
| Capital | +50 |
| Regular city | +20 |

**Example:** 1 capital + 4 cities = 50 + 80 = 130 population cap

### Population Growth

**Formula:**
```
Growth per minute = (Labourers / 10) + (Cities × 0.5)
```

**Examples:**
- Early game: 15 labourers, 1 city → 1.5 + 0.5 = 2 pop/min
- Mid game: 40 labourers, 4 cities → 4 + 2 = 6 pop/min
- Late game: 80 labourers, 8 cities → 8 + 4 = 12 pop/min

### Population Assignment

**Global ratio system:**
- Players set a global ratio (e.g., 50% Labour, 30% Military, 20% Spy)
- System distributes population automatically
- Reassignment is instant with zero friction
- Ratios are adjusted via sliders in the UI

**Role distribution:**
- Labourers are global (not assigned to any tile)
- Military and Spies spawn at the rally point
- Rally point defaults to capital, can be changed instantly to any owned city
- Only one rally point for both Military and Spies

---

## The Three Roles

### Labour

| Property | Value |
|----------|-------|
| Location | Global (not assigned to tiles) |
| Function | Generates gold |
| Generation rate | 5 labourers = 1 gold/sec |
| Upkeep | None |

Labourers are abstract—just a count contributing to income. They don't exist on the map.

### Military

| Property | Value |
|----------|-------|
| Location | Specific tile |
| Spawns at | Rally point |
| Movement speed | 10 seconds per hex |
| Movement visibility | Visible to enemies |
| Upkeep | 0.1 gold/sec per unit |
| Functions | Capture hills, defend territory, combat, kill revealed spies |

**Military capabilities:**
- Can walk into empty hills to capture instantly
- Can walk into undefended occupied hills to capture instantly
- Must win combat to capture defended hills or cities
- Automatically kill any revealed (detected) spies in the same tile
- Detect unrevealed spies by chance (see Spy Detection)
- Multiple armies on same tile merge automatically

### Spy

| Property | Value |
|----------|-------|
| Location | Specific tile |
| Spawns at | Rally point |
| Movement speed | 10 seconds per hex |
| Movement visibility | Invisible |
| Upkeep | 0.2 gold/sec per unit |
| Functions | Influence city allegiance, gather intel at capitals, detect enemy spies |

**Spy capabilities:**
- Move invisibly across the map
- Stationed at enemy city: work on allegiance to flip it
- Stationed at enemy capital: gather intel over time
- Stationed at own city: detect enemy spies
- Can be withdrawn and reassigned at any time
- Cannot attack or be attacked directly (only detected and killed)

---

## Economy

### Gold Generation
- 5 labourers = 1 gold/sec
- Gold accumulates with no cap (unlimited storage)
- Starting gold: 0

**Starting income example:** 20 labourers = 4 gold/sec (if all assigned to Labour)

### Gold Spending

| Action | Cost |
|--------|------|
| Build city on occupied hill | 50 gold (one-time) |
| Military upkeep | 0.1 gold/sec per unit |
| Spy upkeep | 0.2 gold/sec per unit |
| Upgrades | Variable (see Upgrades section) |

### Debt System
- Gold can go negative
- At -50 gold, player is **eliminated**
- Units remain functional during debt (no desertion)
- Upkeep continues to accrue during debt

---

## Combat System

### Movement
- Military moves visibly across hexes
- Travel time: 10 seconds per hex
- Path is visible to enemies with vision of those tiles
- Armies on the same tile merge automatically into one army

### Territory Capture

| Target | Requirement | Result |
|--------|-------------|--------|
| Empty hill | Walk in | Instant capture |
| Occupied hill (no defenders) | Walk in | Instant capture |
| Occupied hill (defenders present) | Win combat | Instant capture after combat |
| Enemy city (no defenders) | Walk in | Instant capture, city preserved |
| Enemy city (defenders present) | Win combat | Instant capture after combat, city preserved |
| NPC city | Walk in | Instant capture |

**Note:** Cities are never destroyed on capture—they transfer ownership.

### Unit Stats

All military units are identical (per team). Stats can be modified by upgrades.

**Base stats:**
| Stat | Value |
|------|-------|
| HP | 100 |
| Strength | 20 |
| Defense | 20% |

### Combat Resolution

Combat is continuous and attrition-based, resolved each tick (1/sec).

**Damage is pooled:** Total army strength is calculated, damage is dealt to the enemy army as a whole, then distributed across enemy units.

**Formulas (per tick):**

```
Attacker damage dealt = (Total Attacker Strength / 10) × (1 - Defender Defense%) × randomness

Defender damage dealt = (Total Defender Strength / 10) × (1 - Attacker Defense%) × randomness
```

**Defender bonus:** The hill owner (defender) gets increased Defense%, not increased damage.

**Randomness factor:** ±10% variation

**Damage distribution:** Pooled damage is spread across enemy units (distribution method TBD—even or random).

**Example calculation:**
10 attackers vs 10 defenders (base stats):
- Attacker total strength: 200
- Attacker damage per tick: (200/10) × 0.8 × ~1.0 = ~16 damage to defenders
- Defender has bonus Defense%, so takes less
- Defender damage per tick: (200/10) × 0.8 × ~1.0 = ~16 damage to attackers (before defender bonus)

### Retreat
- Either side can retreat at any time
- Retreat is instant (select army, move to adjacent hex)
- No retreat cost or penalty
- Retreating army is no longer in combat immediately

### Healing
Not yet defined. Decision needed: Do units heal over time? In cities only? Or stay damaged until replaced?

---

## Spy Mechanics

### Allegiance System

Each city maintains an allegiance score **for each team** in the game.

**Starting state for a newly built/captured city:**
- Owner's allegiance: 100
- All other teams: 0

**Natural drift (per 10 seconds):**
- Owner's allegiance: +1 (regenerates toward 100)
- Other teams' allegiance: -1 (decays toward 0)

**Spy influence (per spy per 10 seconds):**
- Owner's allegiance: -2
- Spy's team allegiance: +1

### City Flipping

A city flips when the owner's allegiance reaches 0:

| Condition | Result |
|-----------|--------|
| Another team has >50 allegiance | City flips to that team |
| Highest competing team has 20-50 allegiance | City flips to that team |
| No team has >20 allegiance | City becomes NPC |

**Target time to flip:** ~4 minutes of uncontested spy presence

**When a city flips:**
- All allegiance scores remain unchanged
- New owner simply becomes whoever triggered the flip
- The old owner's allegiance is now at 0; new owner's allegiance is wherever it was (e.g., 51)
- Natural drift now favors the new owner

### NPC Cities

When a city becomes NPC:
- No owner allegiance regeneration (no owner)
- Other teams' allegiance still decays naturally
- Military can walk in and capture instantly (like an empty hill)
- Allegiance scores persist—if spies remain, they continue working

### Spy Detection

**Military detecting spies:**
- Each military unit in a city has 1% chance per minute to detect each enemy spy
- 10 military = ~10% chance per minute per spy
- Detected by military = spy is **killed immediately**
- Already-revealed spies are killed instantly when military enters

**Spies detecting spies:**
- Each friendly spy in a city has 3-5% chance per minute to detect each enemy spy
- Detection only **reveals** the spy (marks them to the city owner)
- Revealed status is permanent for that specific spy in that specific city
- Revealed spies are NOT killed by the detecting spy

**Revealed spy consequences:**
- Still functions normally (continues influencing allegiance)
- Visible to city owner in UI
- Killed immediately if any military enters the city
- Can be withdrawn to save them

### Capital Intel Gathering

Spies stationed at an enemy capital learn information over time, in a fixed order:

| Order | Intel Revealed | Cumulative Time |
|-------|----------------|-----------------|
| 1 | Gold amount | 3 minutes |
| 2 | Population | 6 minutes |
| 3 | Upgrade tree | 9 minutes |
| 4 | Army positions | 12 minutes |
| 5 | Spy positions | 15 minutes |

**Notes:**
- Intel is revealed progressively (must wait full time for each tier)
- Spy must remain at capital continuously
- If spy leaves or dies, progress is lost (TBD: or does it persist?)
- Multiple spies at capital: TBD if this speeds up intel gathering

### Spy Stacking

There is no limit to how many spies can be in one city. 50 spies is a valid strategy. The counter is:
- Own spies to detect them
- Military to kill revealed spies
- Fast detection through numbers (more military = higher detection chance)

---

## Capital System

### Capital Properties
- +50 population cap (vs +20 for regular cities)
- Loss of capital = immediate elimination
- Always exists (player always has exactly one capital)

### Moving Capital

The capital can be relocated to any other city the player owns.

| Property | Value |
|----------|-------|
| Destination | Any city you own |
| Speed | 30 seconds per hex distance |
| During move | Player frozen—cannot take any actions |
| Existing units | Still fight, still operate, still generate gold |
| Spies | Still function |
| Cancel | Allowed; capital moves to nearest city along the route |

**Frozen state details:**
- Player cannot reassign population
- Player cannot move any units
- Player cannot build cities
- Player cannot change rally point
- Player cannot interact with alliances
- Game continues normally for everyone else
- If attacked, existing military defends automatically

**Capital bonus transfer:**
- The +50 cap bonus follows the capital designation
- Old capital becomes a regular city (+20 cap)
- New capital gains the +50 cap

---

## Upgrade System

### Structure
- **Tree-based:** Some upgrades require prerequisites
- **Unlock gate:** Population threshold must be reached
- **Purchase cost:** Gold
- **Scope:** Global (affects all units of that type)
- **Limit:** Can eventually buy everything (no forced specialization)
- **Permanent:** Cannot be sold or reversed

### Upgrade Categories (Values TBD)

| Category | Example Effects |
|----------|-----------------|
| Military stats | HP increase, Strength increase, Defense increase |
| Spy effectiveness | Faster allegiance influence, better detection chance |
| Labour efficiency | Higher gold generation rate |
| Movement speed | Faster unit travel |
| Population growth | Faster growth rate |

### Upgrade Visibility
- Enemies cannot see your upgrades
- Spies at enemy capital can reveal upgrade tree (after 9 minutes)
- Upgrades only become apparent in combat (unexpected strength/defense)

---

## Alliance System

### Formation
- Invitation-based with offer/request UI
- No limit on alliance size (7 can ally against 1)
- Both players must accept for alliance to form

### Sharing Options

Players choose exactly what to share. Options:
- Vision (see what ally sees)
- Gold amounts
- Upgrade information
- Army positions
- Spy intel

Each option is independently toggled. Asymmetric sharing is allowed (you share vision, they share gold).

### Alliance Breaking
- **Manual:** Either player can break alliance at any time
- **Automatic:** Alliance breaks immediately if one ally attacks the other
- **No forced breaking:** Game never forces allies to fight, even if only allies remain

### Spies and Allies
- Spies can operate in allied cities
- Detection rules still apply normally
- Allows gathering intel that ally doesn't share
- Enables betrayal preparation

---

## Game Setup

### Lobby System
- Players join from lobby browser
- Host creates game with name and player count
- Player colors and names assigned automatically
- Starting positions assigned randomly

### Game Creation
- Host specifies game name
- Host specifies player count (2-8)
- Map size determined automatically by player count

### Ready System
- All players must ready up
- When all ready, countdown begins automatically
- Game starts immediately after countdown (no planning phase)

---

## User Interface

### Main Game Screen Layout

```
┌─────────────────────────────────────────────────────────────────────────┐
│  ROMULUS         💰 127 (+2.3/s)         👥 45/70         ⏱ 14:32      │
├───────────────────────────────────────────────────────────┬─────────────┤
│                                                           │             │
│                                                           │  [context]  │
│                                                           │             │
│                                                           │             │
│                       [ M A P ]                           │             │
│                                                           │             │
│                                                           │             │
│                                                           │             │
│                                                           │             │
├───────────────────────────────────────────────────────────┴─────────────┤
│  ⚒ ━━━━━━●━━━━━━━━ 50%    ⚔ ━━━●━━━━━━━━━ 30%    👁 ━━●━━━━━━━━━ 20%   │
└─────────────────────────────────────────────────────────────────────────┘
```

**Top bar:** Gold (with income rate), Population (current/cap), Game timer
**Map area:** Zoomable hexagonal grid
**Right panel:** Context-sensitive (shows info for selected tile)
**Bottom bar:** Three assignment sliders, always visible and draggable

### Context Panel States

**Your City:**
```
┌─────────────┐
│ ROMA ★      │
│ ─────────── │
│ Capital     │
│             │
│ ⚔ 12        │
│ 👁 4         │
│             │
│ ▢ Rally     │
│             │
│ [Move]      │
└─────────────┘
```

**Enemy City (Visible):**
```
┌─────────────┐
│ ? ? ?       │
│ ─────────── │
│ Owner: Red  │
│             │
│ ⚔ 8         │
│ 👁 ?         │
│             │
│ Your spies: │
│ 👁 3 (1 ⚠)   │
│             │
│ Allegiance: │
│ ░░░░░░▓▓░░  │
│ [Withdraw]  │
└─────────────┘
```

**Move Mode:**
```
┌─────────────┐
│ MOVE        │
│ ─────────── │
│ From: Roma  │
│             │
│ ⚔ ← 8 →     │
│   sending 5 │
│             │
│ 👁 ← 4 →     │
│   sending 0 │
│             │
│ Select      │
│ destination │
│             │
│ [Cancel]    │
└─────────────┘
```

### Unit Movement Flow
1. Select a tile you own
2. Click [Move] in context panel
3. Select number of Military and/or Spies to send
4. Click destination tile on map
5. Units begin moving (Military visible, Spies invisible)

### Notifications
- Toast messages appear top-right of map
- Fade after a few seconds
- Alert types: city under attack, spy detected, border contact with player

### Information Display
- Enemy armies show exact numbers when in your vision
- Fog of war shows last known state with fog overlay
- Your own allegiance scores are visible (TBD: or hidden?)

---

## Screen Designs

### Title Screen
```
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                         │
│                           R O M U L U S                                 │
│                                                                         │
│                    Conquer through steel or whispers                    │
│                                                                         │
│                           [ PLAY ]                                      │
│                           [ HOW TO PLAY ]                               │
│                           [ SETTINGS ]                                  │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Lobby Browser
```
┌─────────────────────────────────────────────────────────────────────────┐
│  GAMES                                                         [←Back] │
├─────────────────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  Caesar's Arena                          3/6      Waiting       │   │
│  │  hosted by Marcus                                        [Join] │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  Quick Match                             2/4      Waiting       │   │
│  │  hosted by Julia                                         [Join] │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  ┌ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┐   │
│  │               [ CREATE NEW GAME ]                             │   │
│  └ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┘   │
└─────────────────────────────────────────────────────────────────────────┘
```

### Create Game
```
┌─────────────────────────────────────────────────────────────────────────┐
│  CREATE GAME                                                   [←Back] │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│         Game Name                                                       │
│         ┌─────────────────────────────────────────┐                     │
│         │ My Game                                 │                     │
│         └─────────────────────────────────────────┘                     │
│                                                                         │
│         Players                                                         │
│              2    3    4    5    6    7    8                            │
│              ○    ○    ●    ○    ○    ○    ○                            │
│                                                                         │
│                        [ CREATE ]                                       │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Game Lobby
```
┌─────────────────────────────────────────────────────────────────────────┐
│  MY GAME                                                       [Leave] │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│         Players                                            2 / 4       │
│                                                                         │
│         ┌──────────────────────────────────────┐                        │
│         │  ●  Marcus (you)              Ready  │                        │
│         └──────────────────────────────────────┘                        │
│         ┌──────────────────────────────────────┐                        │
│         │  ●  Julia                    Ready   │                        │
│         └──────────────────────────────────────┘                        │
│         ┌ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┐                        │
│         │     Waiting for player...            │                        │
│         └ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┘                        │
│                                                                         │
│                    [ READY ]  /  [ NOT READY ]                          │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Game Lobby (Starting)
```
┌─────────────────────────────────────────────────────────────────────────┐
│  MY GAME                                                                │
├─────────────────────────────────────────────────────────────────────────┤
│         Players                                            4 / 4       │
│                                                                         │
│         ┌──────────────────────────────────────┐                        │
│         │  ●  Marcus (you)              Ready  │                        │
│         │  ●  Julia                     Ready  │                        │
│         │  ●  Brutus                    Ready  │                        │
│         │  ●  Cassius                   Ready  │                        │
│         └──────────────────────────────────────┘                        │
│                                                                         │
│                        Starting in  3                                   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Alliance Panel
```
┌─────────────────────────────────────────────────────────────────────────┐
│  ALLIANCES                                                         [X] │
├─────────────────────────────────────────────────────────────────────────┤
│  YOUR ALLIES                                                            │
│  ┌────────────────────────────────────────────────────────────────┐    │
│  │  ● Julia                                                       │    │
│  │  Sharing:  ☑ Vision   ☑ Gold   ☐ Upgrades   ☐ Army positions  │    │
│  │                                             [Edit]  [Break]    │    │
│  └────────────────────────────────────────────────────────────────┘    │
│                                                                         │
│  PENDING                                                                │
│  ┌────────────────────────────────────────────────────────────────┐    │
│  │  ● Brutus wants to ally                   [Accept]  [Decline] │    │
│  └────────────────────────────────────────────────────────────────┘    │
│                                                                         │
│  OTHER PLAYERS                                                          │
│  ┌────────────────────────────────────────────────────────────────┐    │
│  │  ● Cassius                                          [Invite]  │    │
│  └────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────┘
```

### Alliance Invite
```
┌───────────────────────────────────────────┐
│  INVITE CASSIUS                           │
├───────────────────────────────────────────┤
│  Share with them:                         │
│   ☑ Vision                                │
│   ☐ Gold amount                           │
│   ☐ Upgrade info                          │
│   ☐ Army positions                        │
│   ☐ Spy intel                             │
│                                           │
│  Request from them:                       │
│   ☑ Vision                                │
│   ☑ Gold amount                           │
│   ☐ Upgrade info                          │
│   ☐ Army positions                        │
│   ☐ Spy intel                             │
│                                           │
│          [Cancel]         [Send]          │
└───────────────────────────────────────────┘
```

### Pause Screen
```
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                         │
│                             GAME PAUSED                                 │
│                                                                         │
│                      Julia has disconnected                             │
│                                                                         │
│                          Resuming in 24s                                │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Capital Moving (Frozen State)
```
┌─────────────────────────────────────────────────────────────────────────┐
│  ROMULUS         💰 127 (+2.3/s)         👥 45/70         ⏱ 14:32      │
├───────────────────────────────────────────────────────────┬─────────────┤
│░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░│░░░░░░░░░░░░░│
│░░░░░░░░░░░░░░░ CAPITAL MOVING ░░░░░░░░░░░░░░░░░░░░░░░░░░░░│░░░░░░░░░░░░░│
│░░░░░░░░░░░░░░░ Roma → Veii ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░│░░░░░░░░░░░░░│
│░░░░░░░░░░░░░░░ Arriving in 47s ░░░░░░░░░░░░░░░░░░░░░░░░░░░│░░░░░░░░░░░░░│
│░░░░░░░░░░░░░░░ [CANCEL] ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░│░░░░░░░░░░░░░│
│░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░│░░░░░░░░░░░░░│
├───────────────────────────────────────────────────────────┴─────────────┤
│░░⚒░━━━━━━●━━━━━━━━░50%░░░░⚔░━━━●━━━━━━━━━░30%░░░░👁░━━●━━━━━━━━━░20%░░░│
└─────────────────────────────────────────────────────────────────────────┘
```

### Elimination Screen
```
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                         │
│                            YOU HAVE FALLEN                              │
│                                                                         │
│                        Your capital was captured                        │
│                                                                         │
│                        You lasted 23:47                                 │
│                        Cities held: 4                                   │
│                        Cities flipped by spies: 2                       │
│                                                                         │
│                          [ LEAVE GAME ]                                 │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Victory Screen
```
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                         │
│                              VICTORY                                    │
│                                                                         │
│                         You are the last one                            │
│                                                                         │
│                        Game duration: 47:23                             │
│                        Peak cities: 12                                  │
│                        Enemies eliminated: 3                            │
│                        Cities flipped by spies: 5                       │
│                        Battles won: 8                                   │
│                                                                         │
│                          [ RETURN TO MENU ]                             │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Settings
```
┌─────────────────────────────────────────────────────────────────────────┐
│  SETTINGS                                                      [←Back] │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│         Sound                                                           │
│         ━━━━━━━━━━━━━●━━━━━━━━  75%                                     │
│                                                                         │
│         Music                                                           │
│         ━━━━━━━●━━━━━━━━━━━━━━  40%                                     │
│                                                                         │
│         Notifications                                                   │
│         ☑ Show toast alerts                                            │
│         ☑ Play sound on attack                                         │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### How to Play
```
┌─────────────────────────────────────────────────────────────────────────┐
│  HOW TO PLAY                                                   [←Back] │
├─────────────────────────────────────────────────────────────────────────┤
│    ┌─────────────┐   ┌─────────────┐   ┌─────────────┐   ┌─────────────┐               │
│    │    1    │   │    2    │   │    3    │   │    4    │               │
│    │  Basics │   │ Military│   │  Spies  │   │  Win    │               │
│    └─────────┘   └─────────┘   └─────────┘   └─────────┘               │
│        ●             ○             ○             ○                      │
│                                                                         │
│    YOUR POPULATION                                                      │
│                                                                         │
│    Every person in your empire serves one role:                         │
│                                                                         │
│    ⚒ Labour    Generates gold. Gold pays for everything.              │
│    ⚔ Military  Captures hills. Defends cities. Kills spies.           │
│    👁 Spy       Infiltrates enemy cities. Turns them to your side.     │
│                                                                         │
│    Use the sliders at the bottom to assign your population.             │
│                                                                         │
│                                                      [Next →]           │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## UI Design Principles

1. **The sliders never leave.** Population assignment is the core decision—always one drag away.

2. **Context replaces menus.** Click a tile, see what matters. No digging through tabs.

3. **Actions appear when valid.** "Build City" only shows when you can. "Move Capital" only on cities.

4. **Information density scales with ownership.** Your tiles show everything. Enemy tiles show what you've earned.

5. **Toasts interrupt gently.** Important events surface without blocking play.

---

## Quick Reference Tables

### Starting State
| Property | Value |
|----------|-------|
| Population | 20 (all Labour) |
| Capital | 1 (50 pop cap) |
| Gold | 0 |
| Vision | Capital + 6 adjacent hexes |
| Rally point | Capital |

### Key Rates
| Metric | Value |
|--------|-------|
| Gold generation | 1 gold/sec per 5 labourers |
| Population growth | (Labourers/10) + (Cities×0.5) per minute |
| Military movement | 10 sec/hex |
| Spy movement | 10 sec/hex (invisible) |
| Combat tick | 1/sec |
| City flip time | ~4 min (uncontested) |
| Capital intel | 3 min per tier (5 tiers) |
| Capital move | 30 sec/hex |

### Costs
| Item | Cost |
|------|------|
| Build city | 50 gold |
| Military upkeep | 0.1 gold/sec/unit |
| Spy upkeep | 0.2 gold/sec/unit |
| Debt elimination threshold | -50 gold |

### Detection Chances
| Detector | Target | Chance |
|----------|--------|--------|
| Military | Enemy spy | 1% per unit per minute |
| Friendly spy | Enemy spy | 3-5% per spy per minute |

---

## Open Questions / TBD Items

The following items were discussed but left for future definition:

1. **Healing:** Do military units heal? How?
2. **Upgrade tree specifics:** Exact upgrades, costs, prerequisites, effects
3. **Damage distribution:** Even across units or random targeting?
4. **Spy intel persistence:** If spy leaves capital, does intel progress persist?
5. **Multiple spies at capital:** Does this speed up intel gathering?
6. **Own allegiance visibility:** Can players see their own cities' allegiance breakdown?
7. **Defender bonus amount:** Exact Defense% increase for defenders

---

## Allowed Strategies (Explicitly Permitted)

These strategies were explicitly discussed and allowed:

- **Spy stacking:** 50 spies in one city is valid
- **Military doom stacking:** All military on one tile is valid
- **Turtle strategy:** All labourers, no military, hide in corner is valid
- **Early rush:** Immediately send all pop as military is valid
- **Alliance stacking:** 7v1 alliances are valid (but allies cannot win together)