// The weather maker's panel inside its card. The full record is its own page (weather.html),
// because it reads a different family of tables and has a shape the shared feed does not fit:
// resting quotes rather than calls, and every one of them scored twice under two fill models.
// So this stays to the two numbers that say whether it is worth opening.
export async function mount(el, ctx) {
  const [{ data: book }, { data: snap }] = await Promise.all([
    ctx.supabase.from('weather_policy_book').select('policy,fill_model,fills,graded,pnl'),
    ctx.supabase.from('weather_quote_snapshot').select('queue_pos'),
  ])

  const strict = (book ?? []).filter((r) => r.fill_model === 'strict')
  const fills = strict.reduce((t, r) => t + Number(r.fills ?? 0), 0)
  const graded = strict.reduce((t, r) => t + Number(r.graded ?? 0), 0)

  // The one number that decides whether any of the measured maker pool is reachable: a quote
  // resting behind the touch is filled only after everyone ahead of it.
  const rest = snap ?? []
  const first = rest.filter((s) => s.queue_pos === 'inside').length
  const queue = rest.length ? `${Math.round((100 * first) / rest.length)}% of ${ctx.fmt.format(rest.length)} resting quotes are inside the spread` : 'nothing resting'

  el.innerHTML = `<p class="last">
    Paper, all time: ${ctx.fmt.format(fills)} strict ${fills === 1 ? 'fill' : 'fills'}, ${graded ? ctx.fmt.format(graded) + ' graded' : 'none graded yet'} · ${queue}.
    <a href="weather.html" style="color: var(--gold); text-decoration: none; border-bottom: 1px solid color-mix(in srgb, var(--gold) 45%, transparent)">Open the weather desk</a>
  </p>`
}
