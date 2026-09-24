// D1's bot: its own panel inside its card. The full detail lives in the panels below the
// Bots section (they read D1's private tables), so this stays one line: which rules have
// actually POSTED in the last 40 public calls (silent paper calls do not count).
export async function mount(el, ctx) {
  const { data } = await ctx.supabase.from('desk_signals').select('rule,called_at').eq('bot', ctx.bot.id).eq('shown', true).order('called_at', { ascending: false }).limit(40)
  const rules = [...new Set((data ?? []).map((r) => r.rule))]
  // The card's money is the SHOWN book only, the calls above. The full paper book across
  // every rule, silent ones included, is the Book panel, and it is a much larger number;
  // saying "paper book at $10 a call" here made the two panels look like they disagreed.
  el.innerHTML = `<p class="last">${rules.length ? `Posting from ${rules.join(', ')}. The money above is these shown calls only, at $10 each; the full paper book across every rule is in Book.` : 'Every call shown in Discord lands here.'}</p>`
}
