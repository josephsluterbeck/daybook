import { chromium } from 'playwright'
const path = 'file:///home/claude/jarvis/dist-single/index.html'
const errs = []
const b = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {})
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })
const p = await ctx.newPage()
p.on('pageerror', e => errs.push('PAGEERROR ' + e.message))
p.on('console', m => m.type() === 'error' && errs.push('CONSOLE ' + m.text()))
await p.goto(path)
await p.waitForSelector('.tabs')

const report = {}
report.heading = await p.textContent('.topbar h1')
report.perDay = await p.textContent('.hero .figure')

// Money > Plan
await p.click('button.tab:has-text("Money")')
await p.waitForSelector('.stats')
report.stats = await p.$$eval('.stat', els => els.map(e => e.querySelector('.k').textContent + '=' + e.querySelector('.v').textContent))

// Log an expense, confirm envelope math moves
await p.click('.seg button:has-text("Spending")')
await p.fill('input[aria-label="Amount"]', '25')
await p.click('button:has-text("Log")')
await p.waitForTimeout(200)
report.afterLog = await p.textContent('.panel:has-text("Spent this month") header h2')

// Persistence across reload
await p.reload()
await p.waitForSelector('.tabs')
await p.click('button.tab:has-text("Money")')
await p.click('.seg button:has-text("Spending")')
report.afterReload = await p.textContent('.panel:has-text("Spent this month") header h2')

// Every other tab renders
for (const t of ['Queue', 'Tasks', 'Journal', 'Today']) {
  await p.click(`button.tab:has-text("${t}")`)
  await p.waitForTimeout(150)
  report[t] = (await p.$$('.panel')).length + ' panels'
}
await p.screenshot({ path: '/tmp/shot-today.png', fullPage: true })
await p.click('button.tab:has-text("Money")')
await p.waitForTimeout(200)
await p.screenshot({ path: '/tmp/shot-money.png', fullPage: true })

// Dark mode
await ctx.close()
const dctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: 'dark' })
const dp = await dctx.newPage()
await dp.goto(path)
await dp.waitForSelector('.tabs')
await dp.click('button.tab:has-text("Money")')
await dp.waitForTimeout(300)
await dp.screenshot({ path: '/tmp/shot-dark.png' })

// Desktop rail
const wctx = await b.newContext({ viewport: { width: 1280, height: 900 } })
const wp = await wctx.newPage()
await wp.goto(path)
await wp.waitForSelector('.tabs')
await wp.screenshot({ path: '/tmp/shot-desktop.png' })

await b.close()
console.log(JSON.stringify(report, null, 1))
console.log('ERRORS:', errs.length ? errs : 'none')
