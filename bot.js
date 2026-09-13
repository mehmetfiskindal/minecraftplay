/**
 * Autonomous Minecraft Bot – beginner progression
 * Uses the provided minecraft_* MCP functions.
 * Run with the MCP bot; this file only defines the logic.
 */

// ---------------------------------------------------------------------------
// Helper: call a minecraft function with a single retry on timeout
// ---------------------------------------------------------------------------
async function callWithRetry(fn, ...args) {
  let attempt = 0;
  while (attempt < 2) {
    try {
      return await fn(...args);
    } catch (e) {
      // Consider a timeout error; adjust pattern as needed
      if (e.message.includes('timeout') || e.message.includes('No path')) {
        attempt++;
        if (attempt < 2) {
          // brief back‑off before retry
          await new Promise(r => setTimeout(r, 500));
          continue;
        }
      }
      throw e; // re‑throw after exhausting retries
    }
  }
}

// ---------------------------------------------------------------------------
// State machine
// ---------------------------------------------------------------------------
const States = {
  WOOD: 'WOOD',
  CRAFT_TABLE: 'CRAFT_TABLE',
  STICKS: 'STICKS',
  WOODEN_PICKAXE: 'WOODEN_PICKAXE',
  STONE: 'STONE',
  COAL: 'COAL',
  IRON: 'IRON',
  BASE: 'BASE',
  DONE: 'DONE'
};

let state = States.WOOD;

// ---------------------------------------------------------------------------
// Read bot status (health, hunger, time, inventory, position)
// ---------------------------------------------------------------------------
async function getStatus() {
  return await callWithRetry(minecraft_get_status);
}

// ---------------------------------------------------------------------------
// Low‑health: sleep in nearest bed or avoid mobs
// ---------------------------------------------------------------------------
async function handleLowHealth() {
  const s = await getStatus();
  if (s.health < 10) {
    // Try to sleep in a nearby bed
    await callWithRetry(minecraft_sleep_in_bed);
    // If that fails, we simply stay still; the loop will re‑evaluate
  }
}

// ---------------------------------------------------------------------------
// Low hunger: eat most nourishing food or hunt animals
// ---------------------------------------------------------------------------
async function handleLowHunger() {
  const s = await getStatus();
  if (s.hunger < 8) {
    await callWithRetry(minecraft_eat);
    // If no food, the function should handle it; otherwise we could mine animals.
  }
}

// ---------------------------------------------------------------------------
// Night time: sleep if bed nearby, else place a torch (coal + stick)
// ---------------------------------------------------------------------------
async function handleNight() {
  const s = await getStatus();
  if (s.time === 'night') {
    // Try to sleep
    await callWithRetry(minecraft_sleep_in_bed);
    // If we can't sleep, light up with a torch
    // For simplicity, just place a torch block at our feet
    await callWithRetry(minecraft_place_block, 'torch');
  }
}

// ---------------------------------------------------------------------------
// Wood phase: gather oak logs if inventory < 10
// ---------------------------------------------------------------------------
async function woodPhase() {
  const s = await getStatus();
  const logCount = (s.inventory || [])
    .filter(i => i.name === 'oak_log')
    .reduce((c, i) => c + i.count, 0);
  if (logCount < 10) {
    await callWithRetry(minecraft_mine_block, 'oak_log', 4);
  } else {
    state = States.CRAFT_TABLE;
  }
}

// ---------------------------------------------------------------------------
// Place crafting table and move to next state
// ---------------------------------------------------------------------------
async function placeCraftingTable() {
  await callWithRetry(minecraft_craft_item, 'crafting_table', 1);
  await callWithRetry(minecraft_place_block, 'crafting_table');
  state = States.STICKS;
}

// ---------------------------------------------------------------------------
// Craft sticks (4)
// ---------------------------------------------------------------------------
async function craftSticks() {
  await callWithRetry(minecraft_craft_item, 'stick', 4);
  state = States.WOODEN_PICKAXE;
}

// ---------------------------------------------------------------------------
// Craft wooden pickaxe and equip it
// ---------------------------------------------------------------------------
async function craftWoodenPickaxe() {
  await callWithRetry(minecraft_craft_item, 'wooden_pickaxe', 1);
  await callWithRetry(minecraft_equip_best_tools);
  state = States.STONE;
}

// ---------------------------------------------------------------------------
// Stone phase: mine cobblestone, craft stone pickaxe, equip
// ---------------------------------------------------------------------------
async function stonePhase() {
  await callWithRetry(minecraft_mine_block, 'cobblestone', 3);
  await callWithRetry(minecraft_craft_item, 'stone_pickaxe', 1);
  await callWithRetry(minecraft_equip_best_tools);
  state = States.COAL;
}

// ---------------------------------------------------------------------------
// Coal phase: mine coal ore (already coal), collect for torches
// ---------------------------------------------------------------------------
async function coalPhase() {
  await callWithRetry(minecraft_mine_block, 'coal_ore', 4);
  // Coal drops as itself; no smelting needed
  state = States.BASE;
}

// ---------------------------------------------------------------------------
// Iron phase (optional): go to y ≤ 40, mine iron, smelt, craft iron pickaxe
// ---------------------------------------------------------------------------
async function ironPhase() {
  const s = await getStatus();
  // Descend if not already low enough
  if (s.y > 40) {
    await callWithRetry(minecraft_goto, s.x, 40, s.z);
  }
  // Mine iron ore
  await callWithRetry(minecraft_mine_block, 'iron_ore', 4);
  // Smelt raw iron into ingots (fuel: coal we already have)
  await callWithRetry(minecraft_smelt_item, 'raw_iron', 'coal', 4);
  // Craft iron pickaxe
  await callWithRetry(minecraft_craft_item, 'iron_pickaxe', 1);
  await callWithRetry(minecraft_equip_best_tools);
  state = States.BASE;
}

// ---------------------------------------------------------------------------
// Build a simple 5×5 base (walls + roof + bed + chest)
// ---------------------------------------------------------------------------
async function buildBase() {
  const s = await getStatus();
  // Determine a spot around the player (e.g., 2 blocks out)
  const cx = s.x + 2;
  const cz = s.z + 2;
  // Place a 5×5 floor of stone (or cobblestone we already have)
  for (let dx = 0; dx < 5; dx++) {
    for (let dz = 0; dz < 5; dz++) {
      await callWithRetry(minecraft_place_block, 'cobblestone', cx + dx, s.y, cz + dz);
    }
  }
  // Roof at y+1
  for (let dx = 0; dx < 5; dx++) {
    for (let dz = 0; dz < 5; dz++) {
      await callWithRetry(minecraft_place_block, 'cobblestone', cx + dx, s.y + 1, cz + dz);
    }
  }
  // Place bed and chest (requires crafting table already placed)
  await callWithRetry(minecraft_place_block, 'bed', cx + 2, s.y + 1, cz + 2);
  await callWithRetry(minecraft_place_block, 'chest', cx + 2, s.y + 1, cz + 3);
  state = States.DONE;
}

// ---------------------------------------------------------------------------
// Main async loop
// ---------------------------------------------------------------------------
async function runBot() {
  while (state !== States.DONE) {
    try {
      // 1. Always read status first
      await getStatus();

      // 2. Low health handling
      await handleLowHealth();

      // 3. Low hunger handling
      await handleLowHunger();

      // 4. Night handling
      await handleNight();

      // 5. Phase‑based progression
      switch (state) {
        case States.WOOD:
          await woodPhase();
          break;
        case States.CRAFT_TABLE:
          await placeCraftingTable();
          break;
        case States.STICKS:
          await craftSticks();
          break;
        case States.WOODEN_PICKAXE:
          await craftWoodenPickaxe();
          break;
        case States.STONE:
          await stonePhase();
          break;
        case States.COAL:
          await coalPhase();
          break;
        case States.IRON:
          await ironPhase();
          break; // optional – set ENABLE_IRON flag to toggle
        case States.BASE:
          await buildBase();
          break;
        default:
          state = States.DONE;
      }
    } catch (err) {
      console.error('[Bot] Error:', err.message);
      // Brief pause before next iteration
      await new Promise(r => setTimeout(r, 1000));
    }
  }
  // Optional final message
  await callWithRetry(minecraft_say, 'Test tamamlandi');
}

// ---------------------------------------------------------------------------
// Start the bot
// ---------------------------------------------------------------------------
runBot().catch(e => console.fatal('[Bot] Fatal error:', e));