const path = require('path')
const mineflayer = require('mineflayer')
const Vec3 = require('vec3')
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder')
const collectBlock = require('mineflayer-collectblock').plugin
const autoEat = require('mineflayer-auto-eat').loader
const toolPlugin = require('mineflayer-tool').plugin
const pvpPlugin = require('mineflayer-pvp').plugin
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js')
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js')
const { z } = require('zod')

const CONFIG = {
  host: process.env.MC_HOST || 'localhost',
  port: parseInt(process.env.MC_PORT || '25565'),
  username: process.env.MC_USERNAME || 'AIBot',
  version: process.env.MC_VERSION || '26.1.2',
  auth: 'offline'
}

let bot = null
let mcData = null
let ready = false
let connecting = null
let followTimer = null
let fleeing = false

function log (...args) {
  console.error('[bot]', ...args)
}

function ensureBot () {
  if (ready) return Promise.resolve(bot)
  if (connecting) return connecting
  connecting = new Promise((resolve, reject) => {
    log(`connecting to ${CONFIG.host}:${CONFIG.port} as ${CONFIG.username} (${CONFIG.version})`)
    bot = mineflayer.createBot(CONFIG)
    bot.loadPlugin(pathfinder)
    bot.loadPlugin(collectBlock)
    bot.loadPlugin(toolPlugin)
    bot.loadPlugin(pvpPlugin)
    bot.loadPlugin(autoEat)

    const timeout = setTimeout(() => reject(new Error('connection timeout (30s)')), 30000)

    bot.once('spawn', async () => {
      mcData = bot.registry
      const defaultMove = new Movements(bot)
      defaultMove.allow1by1towers = true
      defaultMove.canDig = true
      defaultMove.allowParkour = true
      defaultMove.allowSprinting = true
      bot.pathfinder.setMovements(defaultMove)
      bot.pathfinder.LOSWhenPlacingBlocks = false
      bot.autoEat.options = { priority: 'foodPoints', startAt: 14, bannedFood: [] }
      bot.pathfinder.thinkTimeout = 10000
      let chunkCount = 0
      bot.on('chunkColumnLoad', () => { chunkCount++ })
      const t0 = Date.now()
      while (Date.now() - t0 < 15000) {
        const ground = bot.blockAt(bot.entity.position.floored().offset(0, -1, 0))
        if (ground && chunkCount >= 80) break
        await new Promise(r => setTimeout(r, 500))
      }
      clearTimeout(timeout)
      ready = true
      connecting = null
      log(`spawned at ${fmtPos(bot.entity.position)}, chunks=${chunkCount}`)
      setupReflexes()
      resolve(bot)
    })
    bot.once('kicked', (r) => { clearTimeout(timeout); connecting = null; reject(new Error('kicked: ' + JSON.stringify(r))) })
    bot.once('error', (e) => { clearTimeout(timeout); connecting = null; reject(e) })
    bot.once('end', () => { ready = false; connecting = null; log('disconnected') })
  })
  return connecting
}

function setupReflexes () {
  bot.on('death', () => {
    log('died, respawning')
    stopAll()
    try { bot.respawn() } catch (e) { /* ignore */ }
  })
  bot.on('health', () => {
    if (!ready || fleeing) return
    if (bot.health <= 6) {
      const threat = nearestHostile(20)
      if (threat) flee(threat)
    }
  })
}

function stopAll () {
  if (!bot) return
  try { bot.pathfinder.stop() } catch (e) { /* ignore */ }
  try { bot.collectBlock.cancelTask() } catch (e) { /* ignore */ }
  try { bot.pvp.stop() } catch (e) { /* ignore */ }
  stopFollow()
}

function nearestHostile (radius = 16) {
  const hostiles = ['zombie', 'skeleton', 'spider', 'creeper', 'enderman', 'witch',
    'zombie_villager', 'husk', 'stray', 'drowned', 'phantom', 'pillager', 'vindicator', 'ravager']
  return bot.nearestEntity(e =>
    e.type === 'mob' && e.position.distanceTo(bot.entity.position) < radius &&
    hostiles.some(h => (e.name || '').toLowerCase().includes(h)))
}

function flee (threat) {
  fleeing = true
  stopAll()
  bot.chat('Kaçıyorum!')
  const away = bot.entity.position.minus(threat.position).normalize().scale(24)
  const target = bot.entity.position.plus(away)
  bot.pathfinder.setGoal(new goals.GoalNear(Math.floor(target.x), Math.floor(target.y), Math.floor(target.z), 2))
  setTimeout(() => { fleeing = false }, 8000)
}

function stopFollow () {
  if (followTimer) { clearInterval(followTimer); followTimer = null }
}

function fmtPos (p) {
  return `${Math.floor(p.x)},${Math.floor(p.y)},${Math.floor(p.z)}`
}

function biomeName () {
  try {
    const p = bot.entity.position.floored()
    const b = bot.blockAt(p.offset(0, -1, 0)) || bot.blockAt(p)
    const id = b && b.biome ? b.biome.id : null
    if (id === null || id === undefined) return '?'
    const list = mcData.biomes
    if (Array.isArray(list)) return (list[id] && list[id].name) || `biyom#${id}`
    return (list && list[id] && list[id].name) || `biyom#${id}`
  } catch (e) {
    return '?'
  }
}

const REPLACEABLE = ['air', 'cave_air', 'void_air', 'water', 'lava', 'grass', 'tall_grass', 'fern', 'snow', 'dead_bush', 'dandelion', 'poppy']

async function placeBlockAt (name, pos) {
  const target = bot.blockAt(pos)
  if (target && !REPLACEABLE.includes(target.name)) throw new Error(`hedef dolu: ${target.name} @${fmtPos(pos)}`)
  if (bot.entity.position.distanceTo(pos) > 4.5) {
    await gotoGoal(new goals.GoalNear(pos.x, pos.y, pos.z, 2), 30000)
  }
  const item = bot.inventory.items().find(i => i.name === name)
  if (!item) throw new Error(`envanterde "${name}" yok`)
  await bot.equip(item, 'hand')
  const dirs = [[0, -1, 0], [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, 1, 0]]
  for (const [dx, dy, dz] of dirs) {
    const ref = bot.blockAt(pos.offset(dx, dy, dz))
    if (!ref || ref.name === 'air' || ref.name === 'cave_air' || ref.name === 'water' || ref.name === 'lava') continue
    await bot.placeBlock(ref, new Vec3(-dx, -dy, -dz))
    return
  }
  throw new Error('bitişikte destek blok yok, yerleştirilemedi')
}

async function placeNearby (name, base) {
  const feet = base.floored()
  const spots = []
  for (let dy = 0; dy >= -2; dy--) {
    for (let dx = -2; dx <= 2; dx++) {
      for (let dz = -2; dz <= 2; dz++) {
        const ground = feet.offset(dx, dy, dz)
        const above = ground.offset(0, 1, 0)
        const g = bot.blockAt(ground)
        const a = bot.blockAt(above)
        if (!g || !a) continue
        if (g.name !== 'air' && g.name !== 'water' && g.name !== 'lava' && g.name !== 'cave_air' &&
          REPLACEABLE.includes(a.name)) {
          spots.push(above)
        }
      }
    }
  }
  spots.sort((p1, p2) => p1.distanceSquared(bot.entity.position) - p2.distanceSquared(bot.entity.position))
  let lastErr
  for (const s of spots.slice(0, 8)) {
    try { await placeBlockAt(name, s); return s } catch (e) { lastErr = e }
  }
  throw lastErr || new Error('yakında yerleştirilecek uygun yer yok')
}

const TOOL_MATS = ['netherite_', 'diamond_', 'iron_', 'stone_', 'golden_', 'wooden_']

function bestOf (suffix) {
  for (const m of TOOL_MATS) {
    const n = m + suffix
    const it = bot.inventory.items().find(i => i.name === n)
    if (it) return it
  }
  return null
}

function ok (text) {
  return { content: [{ type: 'text', text }] }
}

function fail (e) {
  return { content: [{ type: 'text', text: 'ERROR: ' + (e && e.message ? e.message : String(e)) }], isError: true }
}

async function withBot (fn) {
  try {
    await ensureBot()
    return ok(await fn())
  } catch (e) {
    return fail(e)
  }
}

function blockId (name) {
  const b = mcData.blocksByName[name.toLowerCase()]
  if (!b) throw new Error(`unknown block/item: ${name}`)
  return b.id
}

function itemId (name) {
  const i = mcData.itemsByName[name.toLowerCase()]
  if (!i) throw new Error(`unknown item: ${name}`)
  return i.id
}

function inventorySummary () {
  const counts = {}
  for (const it of bot.inventory.items()) {
    counts[it.name] = (counts[it.name] || 0) + it.count
  }
  return counts
}

function countItem (name) {
  return bot.inventory.items().filter(i => i.name === name.toLowerCase()).reduce((s, i) => s + i.count, 0)
}

function timeOfDay () {
  const t = bot.time.timeOfDay
  if (t < 1000) return 'sabah'
  if (t < 6000) return 'gündüz'
  if (t < 12000) return 'akşam'
  return 'gece'
}

function withTimeout (promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, rej) => setTimeout(() => rej(new Error(`${label} timeout (${ms / 1000}s)`)), ms))
  ])
}

let gotoCleanup = null

function gotoGoal (goal, ms = 90000) {
  if (gotoCleanup) gotoCleanup()
  return withTimeout(new Promise((resolve, reject) => {
    let done = false
    let stuckRecoveryAt = 0

    const finish = (fn, reason) => {
      if (done) return
      done = true
      cleanup()
      fn(reason)
    }

    const onGoal = () => {
      const p = bot.entity.position
      if (goal.isEnd(p.floored())) {
        finish(resolve)
      }
    }
    const onNoPath = (results) => {
      if (!results || typeof results === 'string') return
      if (results.status === 'noPath') finish(reject, new Error('no path found'))
      else if (results.status === 'timeout') finish(reject, new Error('path search timeout'))
    }
    const onPathReset = async (reason) => {
      if (reason !== 'stuck' && reason !== 'dig_error' && reason !== 'place_error' && reason !== 'no_scaffolding_blocks') return
      if (done || Date.now() - stuckRecoveryAt < 8000) return
      stuckRecoveryAt = Date.now()

      bot.pathfinder.stop()
      bot.clearControlStates()

      const p = bot.entity.position
      const yaw = bot.entity.yaw
      const fwd = new Vec3(-Math.sin(yaw), 0, -Math.cos(yaw)).normalize()
      const goalPos = goal.entity ? goal.entity.position : new Vec3(goal.x, goal.y, goal.z)
      const toGoal = new Vec3(goalPos.x - p.x, 0, goalPos.z - p.z).normalize()
      const dir = toGoal.lengthSq() > 0 ? toGoal : fwd

      const candidates = []
      const dirStep = new Vec3(Math.round(dir.x), 0, Math.round(dir.z))
      for (let i = 1; i <= 2; i++) {
        for (const dy of [0, 1]) {
          const t = p.floored().plus(dirStep.scaled(i)).offset(0, dy, 0)
          const b = bot.blockAt(t)
          if (!b) continue
          if (b.diggable && b.boundingBox === 'block' && b.name !== 'bedrock' && b.name !== 'water' && b.name !== 'lava') {
            candidates.push({ block: b, tool: bot.pathfinder.bestHarvestTool(b) })
          }
        }
      }
      const seen = new Set()
      for (const { block, tool } of candidates) {
        if (seen.has(block.position.toString())) continue
        seen.add(block.position.toString())
        try {
          if (tool) await bot.equip(tool, 'hand')
          bot.clearControlStates()
          await withTimeout(bot.dig(block, true), 20000, 'unstuck-dig')
          await new Promise(r => setTimeout(r, 400))
        } catch (e) { /* keep trying next candidate */ }
      }
      try { if (!done) bot.pathfinder.setGoal(goal) } catch (e) { /* ignore */ }
    }

    function cleanup () {
      bot.removeListener('goal_reached', onGoal)
      bot.removeListener('path_update', onNoPath)
      bot.removeListener('path_reset', onPathReset)
      if (gotoCleanup === cleanup) gotoCleanup = null
    }

    gotoCleanup = cleanup
    bot.on('goal_reached', onGoal)
    bot.on('path_update', onNoPath)
    bot.on('path_reset', onPathReset)
    bot.pathfinder.setGoal(goal)
  }), ms, 'goto')
}

const server = new McpServer({ name: 'minecraft-bot', version: '1.0.0' })

server.tool('get_status', 'Bot ve dünya durumu: can, açlık, konum, zaman, envanter, yakındaki varlıklar. Her karar öncesi çağır.', {}, async () =>
  withBot(() => {
    const nearby = Object.values(bot.entities)
      .filter(e => e !== bot.entity && (e.type === 'player' || e.type === 'mob' || e.type === 'animal'))
      .filter(e => e.position.distanceTo(bot.entity.position) < 24)
      .slice(0, 10)
      .map(e => `${e.name || e.username || e.type}(${Math.round(e.position.distanceTo(bot.entity.position))}m)`)
    return [
      `can=${Math.round(bot.health)}/20 aclik=${Math.round(bot.food)}/20`,
      `konum=${fmtPos(bot.entity.position)} biyom=${biomeName()}`,
      `zaman=${timeOfDay()} (${bot.time.timeOfDay} tick)`,
      `envanter=${JSON.stringify(inventorySummary())}`,
      `yakindaki=${nearby.length ? nearby.join(', ') : 'yok'}`,
      fleeing ? 'DURUM: KAÇIYOR (düşük can)' : ''
    ].filter(Boolean).join('\n')
  }))

server.tool('observe', 'Çevreyi tara: yakındaki cevher, ağaç, su, lava, sandık ve yapı blokları (16 blok yarıçap).', {}, async () =>
  withBot(() => {
    const interesting = ['oak_log', 'birch_log', 'spruce_log', 'dark_oak_log', 'jungle_log', 'acacia_log', 'pale_oak_log',
      'coal_ore', 'iron_ore', 'copper_ore', 'gold_ore', 'redstone_ore', 'lapis_ore', 'diamond_ore', 'emerald_ore',
      'deepslate_coal_ore', 'deepslate_iron_ore', 'deepslate_copper_ore', 'deepslate_gold_ore', 'deepslate_redstone_ore',
      'deepslate_lapis_ore', 'deepslate_diamond_ore', 'deepslate_emerald_ore',
      'water', 'lava', 'chest', 'furnace', 'crafting_table', 'bed', 'oak_leaves', 'cave_air']
    const counts = {}
    const samples = {}
    const positions = bot.findBlocks({
      matching: interesting.map(n => mcData.blocksByName[n]?.id).filter(x => x !== undefined),
      maxDistance: 16,
      count: 400
    })
    for (const p of positions) {
      const b = bot.blockAt(p)
      if (!b) continue
      counts[b.name] = (counts[b.name] || 0) + 1
      if (!samples[b.name]) samples[b.name] = fmtPos(p)
    }
    delete counts.cave_air
    delete samples.cave_air
    const lines = Object.entries(counts).map(([n, c]) => `${n}:${c} @${samples[n]}`)
    return lines.length ? lines.join('\n') : 'çevrede dikkat çekici bir şey yok'
  }))

server.tool('goto', 'Belirtilen koordinata git (yol bulma otomatik).', { x: z.number(), y: z.number(), z: z.number() }, async ({ x, y, z }) =>
  withBot(async () => {
    await gotoGoal(new goals.GoalNear(x, y, z, 0.5))
    return `varıldı: ${fmtPos(bot.entity.position)}`
  }))

server.tool('goto_player', 'Bir oyuncunun yanına git.', { name: z.string() }, async ({ name }) =>
  withBot(async () => {
    const p = bot.players[name]
    if (!p || !p.entity) throw new Error(`oyuncu bulunamadı: ${name} (çevrimiçi: ${Object.keys(bot.players).join(',')})`)
    await gotoGoal(new goals.GoalFollow(p.entity, 2))
    return `${name} yanına varıldı`
  }))

server.tool('follow_player', 'Oyuncuyu takip etmeye başla veya durdur.', { name: z.string(), enabled: z.boolean().default(true) }, async ({ name, enabled }) =>
  withBot(() => {
    stopFollow()
    if (!enabled) return 'takip durduruldu'
    const p = bot.players[name]
    if (!p || !p.entity) throw new Error(`oyuncu bulunamadı: ${name}`)
    followTimer = setInterval(() => {
      if (!ready) return
      const target = p.entity
      if (!target) return
      if (target.position.distanceTo(bot.entity.position) > 3 && !fleeing) {
        bot.pathfinder.setGoal(new goals.GoalFollow(target, 2))
      }
    }, 1500)
    return `${name} takip ediliyor`
  }))

const SEARCH_ALIAS = {
  cobblestone: 'stone', stone_bricks: 'stone_bricks', dirt_path: 'dirt_path',
  grass_block: 'grass_block', planks: 'oak_planks', log: 'oak_log', wood: 'oak_log'
}

server.tool('mine_block', 'Belirli bloktan kaz ve topla (yol bulma + alet kuşanma otomatik).', { name: z.string(), count: z.number().int().min(1).max(64).default(4) }, async ({ name, count }) =>
  withBot(async () => {
    const searchName = SEARCH_ALIAS[name.toLowerCase()] || name.toLowerCase()
    const id = blockId(searchName)
    const dropName = dropNameFor(searchName)
    const before = countItem(dropName)
    let remaining = count
    let collectedTotal = 0
    let lastErr = null
    for (let attempt = 0; attempt < 3 && remaining > 0; attempt++) {
      const positions = bot.findBlocks({ matching: id, maxDistance: 64, count: remaining })
      if (positions.length === 0) {
        lastErr = new Error(`64 blok içinde "${searchName}" bulunamadı. observe kullan veya goto ile başka yere git.`)
        break
      }
      const blocks = positions.map(p => bot.blockAt(p)).filter(Boolean)
      try {
        await withTimeout(bot.collectBlock.collect(blocks, { ignoreNoPath: true }), 90000, 'mine')
        lastErr = null
      } catch (e) {
        lastErr = e
        try { bot.collectBlock.cancelTask() } catch (e2) { /* ignore */ }
      }
      collectedTotal = Math.max(0, countItem(dropName) - before)
      remaining = count - collectedTotal
      if (lastErr && collectedTotal === 0) break
      if (lastErr && collectedTotal > 0) { await new Promise(r => setTimeout(r, 1000)); lastErr = null }
    }
    const summary = `"${name}" kazıldı: +${collectedTotal}/${count} (envanterde toplam ${countItem(dropName)})`
    if (collectedTotal === 0 && lastErr) throw lastErr
    return collectedTotal < count ? summary + ' (hedefe ulaşılamadı, tekrar dene veya kaynak ara)' : summary
  }))

function dropNameFor (blockName) {
  const map = {
    oak_log: 'oak_log', stone: 'cobblestone', coal_ore: 'coal', deepslate_coal_ore: 'coal',
    iron_ore: 'raw_iron', deepslate_iron_ore: 'raw_iron', copper_ore: 'raw_copper', deepslate_copper_ore: 'raw_copper',
    gold_ore: 'raw_gold', deepslate_gold_ore: 'raw_gold', redstone_ore: 'redstone', deepslate_redstone_ore: 'redstone',
    lapis_ore: 'lapis_lazuli', deepslate_lapis_ore: 'lapis_lazuli', diamond_ore: 'diamond', deepslate_diamond_ore: 'diamond',
    emerald_ore: 'emerald', deepslate_emerald_ore: 'emerald', leaves: 'apple'
  }
  return map[blockName.toLowerCase()] || blockName.toLowerCase()
}

server.tool('craft_item', 'Eşya craftla (crafting masası gerekirse envanterden koyar).', { name: z.string(), count: z.number().int().min(1).max(64).default(1) }, async ({ name, count }) =>
  withBot(async () => {
    itemId(name)
    let recipes = bot.recipesFor(itemId(name), null, 1, true)
    let placedTableHere = null
    if (!recipes.length) {
      const all = bot.recipesAll(itemId(name), null, true).filter(r => r.requiresTable)
      if (all.length && countItem('crafting_table') > 0) {
        placedTableHere = await placeNearby('crafting_table', bot.entity.position.floored())
        recipes = bot.recipesFor(itemId(name), null, 1, true)
      }
    }
    if (!recipes.length) throw new Error(`"${name}" craftlanamıyor: ya tarif yok ya malzeme eksik ya crafting masası yok. get_status ile envantere bak.`)
    const recipe = recipes[0]
    const perCraft = (recipe.result && recipe.result.count) || 1
    const iterations = Math.max(1, Math.ceil(count / perCraft))
    if (recipe.requiresTable) {
      let table = bot.findBlock({ matching: blockId('crafting_table'), maxDistance: 32 })
      if (!table) {
        if (countItem('crafting_table') === 0) {
          const tableRecipes = bot.recipesFor(itemId('crafting_table'), null, 1, false)
          if (!tableRecipes.length) throw new Error('crafting masası craftlanamıyor (4x planks gerekli)')
          await bot.craft(tableRecipes[0], 1)
        }
        placedTableHere = await placeNearby('crafting_table', bot.entity.position.floored())
        table = bot.blockAt(placedTableHere)
      }
      await gotoGoal(new goals.GoalNear(table.position.x, table.position.y, table.position.z, 2), 30000)
      await bot.craft(recipe, iterations, table)
    } else {
      await bot.craft(recipe, iterations)
    }
    return `craftlandı: ~${iterations * perCraft}x ${name} (envanterde ${countItem(name)})`
  }))

server.tool('smelt_item', 'Fırında erit (ör. raw_iron -> iron_ingot). Yakındaki fırını kullanır.', { input: z.string(), fuel: z.string().default('coal'), count: z.number().int().min(1).max(64).default(1) }, async ({ input, fuel, count }) =>
  withBot(async () => {
    const furnaceBlock = bot.findBlock({ matching: blockId('furnace'), maxDistance: 48 })
    if (!furnaceBlock) throw new Error('yakında fırın yok. craft_item ile furnace craftla, place_block ile koy.')
    await gotoGoal(new goals.GoalNear(furnaceBlock.position.x, furnaceBlock.position.y, furnaceBlock.position.z, 2), 30000)
    const furnace = await bot.openFurnace(furnaceBlock)
    if (countItem(fuel) > 0) await furnace.putFuel(fuel, null, Math.min(count, countItem(fuel)))
    if (countItem(input) > 0) await furnace.putInput(input, null, Math.min(count, countItem(input)))
    await new Promise(r => setTimeout(r, 1000))
    furnace.close()
    return `fırına kondu: ${input} + ${fuel}. ~${count * 10}s sonra get_status ile sonucu kontrol et (smelt_result yoksa bekle).`
  }))

server.tool('place_block', 'Envanterden blok yerleştir. Koordinat verilmezse botun yanına koyar.', { name: z.string(), x: z.number().optional(), y: z.number().optional(), z: z.number().optional() }, async ({ name, x, y, z }) =>
  withBot(async () => {
    itemId(name)
    if (countItem(name) === 0) throw new Error(`envanterde "${name}" yok`)
    let pos
    if (x !== undefined && y !== undefined && z !== undefined) {
      pos = new Vec3(Math.floor(x), Math.floor(y), Math.floor(z))
      await placeBlockAt(name, pos)
    } else {
      pos = await placeNearby(name, bot.entity.position.floored())
    }
    return `yerleştirildi: ${name} @${fmtPos(pos)}`
  }))

server.tool('equip_best_tools', 'En iyi kazma/balta/kılıç ve zırhı kuşan.', {}, async () =>
  withBot(async () => {
    const pick = bestOf('pickaxe')
    if (pick) await bot.equip(pick, 'hand').catch(() => {})
    const armorSlots = [['helmet', 'head'], ['chestplate', 'torso'], ['leggings', 'legs'], ['boots', 'feet']]
    for (const [suffix, slot] of armorSlots) {
      const a = bestOf(suffix)
      if (a) await bot.equip(a, slot).catch(() => {})
    }
    const sword = bestOf('sword')
    return `kuşanıldı. elde: ${pick ? pick.name : (sword ? sword.name : 'boş')}${sword && pick ? ' (savaşta otomatik ' + sword.name + ')' : ''}`
  }))

server.tool('eat', 'Envanterdeki en besleyici yiyeceği ye.', {}, async () =>
  withBot(async () => {
    bot.autoEat.eat().catch(() => {})
    await new Promise(r => setTimeout(r, 3000))
    return `yendi. aclik=${Math.round(bot.food)}/20`
  }))

server.tool('sleep_in_bed', 'Yakındaki yatakta uyu (geceyse).', {}, async () =>
  withBot(async () => {
    const bed = bot.findBlock({ matching: mcData.blocksArray.filter(b => b.name.includes('bed')).map(b => b.id), maxDistance: 32 })
    if (!bed) throw new Error('32 blok içinde yatak yok')
    await gotoGoal(new goals.GoalNear(bed.position.x, bed.position.y, bed.position.z, 2), 30000)
    await bot.sleep(bed)
    return 'uyundu, sabah oldu'
  }))

server.tool('attack_entity', 'Bir oyuncuya veya en yakın düşmanca moba saldır (PVP otomatik ekipman kullanır).', { target: z.string().optional().describe('oyuncu adı; boşsa en yakın hostile mob') }, async ({ target }) =>
  withBot(async () => {
    let entity
    if (target) {
      const p = bot.players[target]
      if (!p || !p.entity) throw new Error(`oyuncu bulunamadı: ${target}`)
      entity = p.entity
    } else {
      entity = nearestHostile(24)
      if (!entity) throw new Error('yakında düşman yok')
    }
    const sword = bestOf('sword')
    if (sword) await bot.equip(sword, 'hand').catch(() => {})
    bot.pvp.attack(entity)
    return `saldırılıyor: ${entity.name || entity.username || target}`
  }))

server.tool('say', 'Oyun içi sohbetten mesaj gönder.', { message: z.string() }, async ({ message }) =>
  withBot(() => { bot.chat(message); return `soylendi: ${message}` }))

server.tool('stop', 'Tüm aktif işleri durdur (yürüme, kazma, pvp, takip).', {}, async () =>
  withBot(() => { stopAll(); return 'durduruldu' }))

server.tool('disconnect', 'Botu sunucudan çıkar.', {}, async () => {
  stopAll()
  if (bot) { bot.quit(); bot = null }
  ready = false
  connecting = null
  return 'bot ayrıldı'
})

async function main () {
  const transport = new StdioServerTransport()
  await server.connect(transport)
  log('MCP server hazır (stdio)')
  ensureBot().catch(e => log('initial connect failed:', e.message, '- ilk tool çağrısında tekrar denenecek'))
}

main().catch(e => { console.error(e); process.exit(1) })
