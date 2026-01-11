# Romulus Implementation Phases

## Philosophy

Key design decisions:
1. **Win condition early** - Playable game by Phase 2
2. **Foundation split** - Phase 1 is three sub-phases for manageability
3. **Spies have early value** - Basic intel in Phase 5, allegiance in Phase 6
4. **Separate unit HP** - Each unit tracked individually for combat

Each phase = testable, playable state.

---

## Phase 1a: Tick + Map

Core infrastructure. Hex grid exists and updates.

### Tick System
- [ ] Convex scheduled function: 1 tick/sec per active game
- [ ] Game state updates each tick
- [ ] Server-authoritative (no client prediction)

### Map Schema
- [ ] `tiles` table: id, gameId, q, r, ownerId, type (empty|city|capital)
- [ ] Hex grid generation (~8×8 based on player count)
- [ ] Starting positions: capital + 6 adjacent tiles each
- [ ] NPC cities scattered (per spec: no defenders, military walks in to capture)

### Basic UI
- [ ] Hex map renderer (static, no zoom/pan yet)
- [ ] Tiles colored by owner
- [ ] Capital/city markers

**Deliverable:** See hex map with starting territories. Tick runs but nothing changes yet.

---

## Phase 1b: Vision + Fog

What you can and can't see.

### Vision System
- [ ] `playerVision` tracking: visible tiles per player
- [ ] Vision rule: tiles adjacent to owned tiles are visible
- [ ] Vision updates on territory change

### Fog of War
- [ ] Previously seen tiles stored with last known state
- [ ] Fog overlay on previously-seen-but-not-visible tiles
- [ ] Unexplored = completely hidden

### UI
- [ ] Fog visual treatment (dim/overlay)
- [ ] Clear distinction: visible vs fogged vs unexplored

**Deliverable:** Fog of war works. Can only see adjacent to owned territory.

---

## Phase 1c: Economy + Sliders

Resources tick up. Player makes choices.

### Player Game State
- [ ] `gamePlayers` additions: gold, population, labourRatio, militaryRatio, spyRatio, rallyPointTileId
- [ ] Starting: 20 pop, 100% labour, 0 gold, rally = capital

### Economy Calculations (per tick)
- [ ] Gold gen: 1 gold/sec per 5 labourers
- [ ] Pop growth: (labourers/10) + (cities×0.5) per minute
- [ ] Pop cap: capital=50, city=20

### UI
- [ ] Three sliders (always visible at bottom)
- [ ] Top bar: gold (with +rate), pop (current/cap), game timer
- [ ] Sliders update ratios in real-time

**Deliverable:** Adjust sliders, watch gold/pop tick up. Economy works.

---

## Phase 2: Military + Basic Win

Armies move, capture territory, someone wins. First complete game loop.

### Schema
- [ ] `armies` table: id, gameId, ownerId, tileId, targetTileId, departureTime, arrivalTime

### Spawning
- [ ] Military spawns at rally point based on militaryRatio
- [ ] Fractional accumulation → spawns as whole units
- [ ] Track `militaryAccumulator` on player state

### Movement
- [ ] Select army → select destination → units move
- [ ] Travel time: 10 sec/hex
- [ ] Pathfinding through owned/neutral territory only
- [ ] Armies visible to enemies when in their vision
- [ ] Armies on same tile auto-merge

### Territory Capture
- [ ] Empty tile = instant capture
- [ ] Undefended enemy tile = instant capture
- [ ] NPC city = instant capture (per spec)
- [ ] Vision updates on capture

### Upkeep
- [ ] 0.1 gold/sec per military unit
- [ ] Deducted each tick

### Win Condition
- [ ] Capital captured = eliminated (set eliminatedAt, eliminationReason, finishPosition)
- [ ] Last player standing = winner
- [ ] Game status → finished, update lifetime stats

### UI
- [ ] Army icons on map with unit counts
- [ ] Movement path preview
- [ ] Rally point selector
- [ ] Context panel: tile info, army controls, move mode

**Deliverable:** Race to capture capitals. Someone wins. Complete game loop.

---

## Phase 3: Combat + Cities

Armies fight. Build infrastructure.

### Unit Schema
- [ ] `units` table: id, armyId, hp (each unit tracked individually)
- [ ] Base stats: 100 HP, 20 strength, 20% defense
- [ ] Units created when military spawns, deleted when army eliminated

### Combat System
- [ ] Triggers when army enters tile with enemy army
- [ ] Continuous attrition each tick while both armies present
- [ ] **Attacker damage** = (Total Attacker Strength / 10) × (1 - Defender Defense%) × random(±10%)
- [ ] **Defender damage** = (Total Defender Strength / 10) × (1 - Attacker Defense%) × random(±10%)
- [ ] Defender bonus: increased Defense% (exact amount TBD per spec)
- [ ] Damage distributed across enemy units (method TBD: even or random per spec)
- [ ] Units die at 0 HP
- [ ] Combat ends when one side eliminated or retreats

### Retreat
- [ ] Either side can retreat any time
- [ ] Select army → move to adjacent hex
- [ ] Instant, no penalty

### Cities
- [ ] Build city on owned tile: 50 gold
- [ ] City adds +20 pop cap
- [ ] Cities survive capture, change owner (never destroyed)

### Debt Elimination
- [ ] Gold reaches -50 = eliminated

### UI
- [ ] "Build City" button in context panel (when valid)
- [ ] Combat indicator on contested tiles
- [ ] Unit HP visualization (health bars or counts)

**Deliverable:** Real warfare. Armies clash, cities change hands.

---

## Phase 4: Capital Movement

Move capital to survive.

### Mechanics
- [ ] Move capital to any owned city
- [ ] Travel time: 30 sec/hex distance
- [ ] Player frozen during move (no actions)
- [ ] Existing units still fight, generate gold, operate
- [ ] Cancel: capital moves to nearest city along route
- [ ] +50 cap follows capital, old capital → +20 city

### UI
- [ ] "Move Capital" button (on owned cities)
- [ ] Frozen state overlay (per spec mockup)
- [ ] Movement progress indicator
- [ ] Cancel button

**Deliverable:** Capital movement adds strategic depth. Can escape elimination.

---

## Phase 5: Spy Foundation + Intel

Spies move, scout, detect. Early offensive value.

### Schema
- [ ] `spies` table: id, gameId, ownerId, tileId, targetTileId, departureTime, arrivalTime, isRevealed

### Spawning & Movement
- [ ] Spawns at rally point based on spyRatio
- [ ] Track `spyAccumulator` on player state
- [ ] Movement: 10 sec/hex, invisible to all enemies
- [ ] Upkeep: 0.2 gold/sec per spy

### Basic Intel (NEW)
- [ ] Spy at enemy tile reveals: army count, unit count
- [ ] Intel visible in context panel for tiles with your spies
- [ ] Gives offensive scouting value before allegiance

### Detection
- [ ] Military detecting spies: 1% per unit per minute → spy killed
- [ ] Friendly spies detecting: 3-5% per spy per minute → spy revealed
- [ ] Revealed = still functions but killed if military enters
- [ ] Revealed status permanent for that spy in that city

### UI
- [ ] Spy icons (own spies only visible)
- [ ] Revealed spy indicator
- [ ] Spy counter in context panel
- [ ] Intel display for scouted tiles

**Deliverable:** Spies scout enemy territory. See enemy army counts. Counter-espionage works.

---

## Phase 6: Spy Allegiance

Cities flip. Deep intel at capitals.

### Schema
- [ ] `cityAllegiance` table: id, gameId, tileId, teamId, score

### Allegiance System
- [ ] Each city has allegiance score per team (0-100)
- [ ] New city: owner starts at 100, others at 0
- [ ] Natural drift per 10 sec: owner +1, others -1
- [ ] Spy influence per 10 sec: owner -2, spy's team +1
- [ ] Target flip time: ~4 min uncontested

### City Flipping
- [ ] Triggers when owner allegiance reaches 0
- [ ] Team >50 allegiance: flips to them
- [ ] Team 20-50 allegiance: flips to them
- [ ] No team >20: becomes NPC
- [ ] Allegiance scores persist after flip

### Capital Intel (Progressive)
- [ ] Spies at enemy capital gather intel over time
- [ ] Tiers (cumulative): 3min gold, 6min pop, 9min upgrades, 12min armies, 15min spies
- [ ] Progress lost if spy leaves or dies (TBD per spec if persists)
- [ ] Multiple spies: TBD if speeds up (per spec)

### UI
- [ ] Allegiance bar on enemy cities (your spy progress)
- [ ] Intel panel for capital intel
- [ ] City flip notification

**Deliverable:** Full spy warfare. Cities flip via espionage.

---

## Phase 7: Upgrades

Tech tree for permanent bonuses.

### System
- [ ] `playerUpgrades` table: id, gamePlayerId, upgradeId, purchasedAt
- [ ] Tree-based: some upgrades require prerequisites
- [ ] Population threshold unlock gates
- [ ] Gold purchase cost
- [ ] Categories: military stats, spy effectiveness, labour efficiency, movement speed, pop growth
- [ ] Global effect (all units of type)
- [ ] Permanent (no selling)
- [ ] Hidden from enemies until revealed by spy intel or combat

### UI
- [ ] Upgrade tree panel
- [ ] Purchase confirmation
- [ ] Prerequisite visualization
- [ ] Locked state for unmet prerequisites

**Deliverable:** Strategic tech choices.

---

## Phase 8: Alliances

Team up or betray.

### System
- [ ] `alliances` table: id, gameId, player1Id, player2Id, status (pending|active)
- [ ] `allianceSharing` table: id, allianceId, playerId, sharingType, enabled
- [ ] Invitation: offer/request flow
- [ ] Sharing toggles: vision, gold, upgrades, army positions, spy intel
- [ ] Asymmetric sharing allowed
- [ ] Break: manual or auto on attack
- [ ] Spies can operate in allied cities (enables betrayal)
- [ ] Path through allied territory (update pathfinding)

### UI
- [ ] Alliance panel (allies, pending, others)
- [ ] Invite modal with sharing checkboxes
- [ ] Alliance indicator on player list
- [ ] Break alliance confirmation

**Deliverable:** Multiplayer diplomacy. Temporary truces, inevitable betrayal.

---

## Phase 9: Polish

Feel good, play smooth.

### Notifications
- [ ] Toast system (top-right)
- [ ] Alert types: city under attack, spy detected, border contact
- [ ] Sound on critical alerts

### Pause System
- [ ] Game pauses globally on disconnect
- [ ] 30 sec budget per player per game
- [ ] Auto-unpause after timeout
- [ ] Reconnect during pause
- [ ] Pause overlay (per spec mockup)

### Sound
- [ ] Background music with volume control
- [ ] Action SFX
- [ ] Combat sounds

### Tutorial
- [ ] 4-page how-to-play screens (per spec)
- [ ] Accessible from title + in-game menu

**Deliverable:** Polished, shippable game.

---

## Summary

| Phase | Name | Key Deliverable |
|-------|------|-----------------|
| 1a | Tick + Map | Hex grid renders, tick runs |
| 1b | Vision + Fog | Fog of war works |
| 1c | Economy + Sliders | Gold/pop tick up, sliders work |
| 2 | Military + Basic Win | First playable game |
| 3 | Combat + Cities | Real warfare |
| 4 | Capital Movement | Escape mechanism |
| 5 | Spy Foundation + Intel | Scout enemy armies |
| 6 | Spy Allegiance | Cities flip |
| 7 | Upgrades | Tech tree |
| 8 | Alliances | Diplomacy |
| 9 | Polish | Ship it |

---

## Unresolved Questions (from spec TBDs)

1. **Healing** - Do units heal? How? (spec undefined)
2. **Damage distribution** - Even across units or random targeting? (spec undefined)
3. **Defender bonus amount** - Exact Defense% increase? (spec undefined)
4. **Spy intel persistence** - If spy leaves capital, does progress persist? (spec TBD)
5. **Multiple spies at capital** - Speeds up intel? (spec TBD)
6. **Map gen algorithm** - Pre-made templates or procedural?
7. **Tick rate** - 1/sec enough for smooth combat feel?
8. **Mobile support** - Touch controls needed?
9. **Spectator mode** - Watch after elimination? (spec says no to prevent info leaking)
10. **Ranking/ELO** - Track skill over time?
