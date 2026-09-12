const { Client } = require('@modelcontextprotocol/sdk/client/index.js')
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js')

async function main () {
  const transport = new StdioClientTransport({ command: 'node', args: [__dirname + '/index.js'] })
  const client = new Client({ name: 'test-client', version: '1.0.0' })
  await client.connect(transport)

  let failed = 0
  async function call (name, args = {}) {
    const r = await client.callTool({ name, arguments: args }, undefined, { timeout: 240000 })
    const text = r.content.map(c => c.text).join('\n')
    console.log(`\n== ${name} ==\n${text}`)
    if (r.isError) failed++
    return text
  }

  await call('get_status')
  await call('mine_block', { name: 'oak_log', count: 4 })
  await call('craft_item', { name: 'oak_planks', count: 8 })
  await call('craft_item', { name: 'crafting_table', count: 1 })
  await call('craft_item', { name: 'stick', count: 4 })
  await call('craft_item', { name: 'wooden_pickaxe', count: 1 })
  await call('equip_best_tools')
  await call('mine_block', { name: 'cobblestone', count: 3 })
  await call('craft_item', { name: 'stone_pickaxe', count: 1 })
  await call('place_block', { name: 'cobblestone' })
  await call('say', { message: 'Test tamamlandi: odun->planks->masa->kazma->tas!' })
  await call('get_status')

  console.log(`\nSONUC: ${failed === 0 ? 'TUM TESTLER GECTI' : failed + ' HATA'}`)
  await client.close()
  process.exit(failed === 0 ? 0 : 1)
}

main().catch(e => { console.error('TEST FAILED:', e); process.exit(1) })
