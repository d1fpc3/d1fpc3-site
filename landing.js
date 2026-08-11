(function () {
  'use strict'

  const CONFIG = {
    checkoutUrl: '',
    discordUrl: 'https://discord.gg/FAQD5Cr5p7',
  }

  function parseDiscordInvite(url) {
    const match = String(url || '').match(/(?:discord\.gg|discord(?:app)?\.com\/invite)\/([\w-]+)/)
    return match ? match[1] : ''
  }

  function formatMemberCount(value) {
    const count = Number(value)
    if (!Number.isFinite(count) || count <= 0) return ''
    return `${count.toLocaleString('en-US')} ${count === 1 ? 'member' : 'members'}`
  }

  const Landing = { parseDiscordInvite, formatMemberCount }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = Landing
  }

  if (typeof document === 'undefined') return

  document.documentElement.classList.add('js')

  document.querySelectorAll('[data-buy]').forEach((button) => {
    if (CONFIG.checkoutUrl) {
      button.addEventListener('click', () => { window.location.href = CONFIG.checkoutUrl })
      return
    }

    button.setAttribute('aria-disabled', 'true')
    button.textContent = 'Checkout not connected yet'
    button.addEventListener('click', (event) => event.preventDefault())
  })

  if (!CONFIG.checkoutUrl) {
    document.querySelectorAll('[data-checkout-status]').forEach((status) => {
      status.hidden = false
    })
  }

  const inviteCode = parseDiscordInvite(CONFIG.discordUrl)
  const footerDiscord = document.getElementById('foot-discord')
  const communityLink = document.getElementById('community-link')

  if (CONFIG.discordUrl) {
    if (footerDiscord) footerDiscord.href = CONFIG.discordUrl
    if (communityLink) communityLink.href = CONFIG.discordUrl
  }

  if (inviteCode && typeof fetch === 'function') {
    fetch(`https://discord.com/api/v10/invites/${inviteCode}?with_counts=true`)
      .then((response) => response.ok ? response.json() : Promise.reject(new Error('Discord invite unavailable')))
      .then((invite) => {
        const memberCount = formatMemberCount(invite && invite.approximate_member_count)
        if (!memberCount) return

        document.querySelectorAll('[data-members]').forEach((target) => {
          target.textContent = `${memberCount} in the D1 Discord`
        })
      })
      .catch(() => {})
  }

  document.querySelectorAll('.faq-list details').forEach((details) => {
    const marker = details.querySelector('summary i')
    if (!marker) return

    details.addEventListener('toggle', () => {
      marker.textContent = details.open ? '−' : '+'
    })
  })

  const showPage = () => document.documentElement.classList.add('is-ready')
  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(() => requestAnimationFrame(showPage))
  } else {
    showPage()
  }
})()
