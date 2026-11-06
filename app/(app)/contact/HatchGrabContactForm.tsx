'use client'
// app/contact/HatchGrabContactForm.tsx — 🔴 HATCHGRAB'S OWN CONTACT FORM (contact-1, 2 November 2026; docs/contact-1-report.md).
// It replaced the Tally embed on the HatchGrab render of /contact ONLY. Village Foodie's /contact, venue and truck pages keep Tally
// (./ContactForm.tsx, unchanged).
//
// 🔴 EVERY WORD ARRIVES RESOLVED FROM THE SERVER (`words`), in the visitor's country's language (HatchGrabContact.tsx reads
// `contactPage.form`). So the first paint is already in the page's language — no English frame while a catalogue loads — and the
// two error sentences already carry the support address.
// 🔴 THE RULES ARE lib/contact.ts's, the same function the server runs (app/api/contact → lib/contact-server.ts): a message the
// browser lets through is one the server accepts, and the server still checks everything itself.
// Spam protection, no captcha: the hidden trap field (`CONTACT_TRAP_FIELD`, off-screen, aria-hidden, no tab stop) and the signed
// render timestamp (`rendered`, from the page's server render) go back with the message; the server answers a bot "sent".
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { CONTACT_LIMITS, CONTACT_TOPICS, CONTACT_TRAP_FIELD, businessRequired, validateContact, type ContactField, type ContactFieldError, type ContactResult, type ContactTopic } from '@/lib/contact'

export interface ContactFormWords {
  topicLabel: string; topics: Record<ContactTopic, string>
  nameLabel: string; namePlaceholder: string; emailLabel: string
  businessLabel: string; optional: string; businessPlaceholder: string
  messageLabel: string; send: string; sending: string
  privacyLine: string; privacyLink: string; thanksTitle: string; thanksBody: string
  errors: Record<ContactFieldError | 'rateLimited' | 'failed', string>
}

/** An example address, not a word: the same in every language (as the support address is). */
const EMAIL_PLACEHOLDER = 'you@example.com'
const ORDER: ContactField[] = ['topic', 'name', 'email', 'business', 'message']

export function HatchGrabContactForm({ words, initialTopic, rendered, country, locale, privacyHref }: {
  words: ContactFormWords; initialTopic: ContactTopic; rendered: string; country: string | null; locale: string; privacyHref: string
}) {
  const [v, setV] = useState({ topic: initialTopic, name: '', email: '', business: '', message: '' })
  const [errors, setErrors] = useState<Partial<Record<ContactField, ContactFieldError>>>({})
  const [formError, setFormError] = useState<'rateLimited' | 'failed' | null>(null)
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle')
  const [tried, setTried] = useState(false)
  const trap = useRef<HTMLInputElement>(null)
  const form = useRef<HTMLFormElement>(null)
  const thanks = useRef<HTMLDivElement>(null)
  // Once the thank-you box has replaced the form, a screen reader and the keyboard land on it (after the render, not before).
  useEffect(() => { if (state === 'sent') thanks.current?.focus() }, [state])

  const set = (k: keyof typeof v, value: string) => {
    const next = { ...v, [k]: value }
    setV(next)
    // Once a send was tried, a field's message follows what is typed (it clears as soon as the field is right).
    if (tried) setErrors(validateContact({ ...next, topic: next.topic as ContactTopic }))
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (state === 'sending') return
    setTried(true); setFormError(null)
    const found = validateContact({ ...v, topic: v.topic as ContactTopic })
    setErrors(found)
    const first = ORDER.find(k => found[k])
    if (first) { form.current?.querySelector<HTMLElement>(`[name="${first}"]`)?.focus(); return }
    setState('sending')
    let result: ContactResult = { ok: false, code: 'failed' }
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...v, [CONTACT_TRAP_FIELD]: trap.current?.value ?? '', rendered, country, locale, page: window.location.pathname + window.location.search }),
      })
      result = await res.json()
    } catch { /* a network failure is "something went wrong" */ }
    if (result.ok) {
      setState('sent')
      return
    }
    setState('idle')
    if (result.code === 'invalid') {
      setErrors(result.fields)
      const firstBad = ORDER.find(k => result.code === 'invalid' && result.fields[k])
      if (firstBad) form.current?.querySelector<HTMLElement>(`[name="${firstBad}"]`)?.focus()
    } else setFormError(result.code === 'rate_limited' ? 'rateLimited' : 'failed')
  }

  if (state === 'sent') {
    return (
      <div ref={thanks} className="cf-thanks" role="status" tabIndex={-1}>
        <p className="cf-thanks-title">{words.thanksTitle}</p>
        <p>{words.thanksBody}</p>
      </div>
    )
  }

  const needBusiness = businessRequired(v.topic as ContactTopic)
  const err = (k: ContactField) => (errors[k] ? <p className="cf-error" id={`cf-${k}-error`}>{words.errors[errors[k]!]}</p> : null)
  const a11y = (k: ContactField) => ({ id: `cf-${k}`, name: k, 'aria-invalid': errors[k] ? true : undefined, 'aria-describedby': errors[k] ? `cf-${k}-error` : undefined })

  return (
    <form ref={form} className="cf" onSubmit={submit} noValidate>
      <div className="cf-field">
        <label htmlFor="cf-topic">{words.topicLabel}</label>
        <select {...a11y('topic')} value={v.topic} onChange={e => set('topic', e.target.value)}>
          {CONTACT_TOPICS.map(id => <option key={id} value={id}>{words.topics[id]}</option>)}
        </select>
        {err('topic')}
      </div>
      <div className="cf-pair">
        <div className="cf-field">
          <label htmlFor="cf-name">{words.nameLabel}</label>
          <input {...a11y('name')} type="text" autoComplete="name" required maxLength={CONTACT_LIMITS.name} placeholder={words.namePlaceholder} value={v.name} onChange={e => set('name', e.target.value)} />
          {err('name')}
        </div>
        <div className="cf-field">
          <label htmlFor="cf-email">{words.emailLabel}</label>
          <input {...a11y('email')} type="email" autoComplete="email" inputMode="email" required maxLength={CONTACT_LIMITS.email} placeholder={EMAIL_PLACEHOLDER} value={v.email} onChange={e => set('email', e.target.value)} />
          {err('email')}
        </div>
      </div>
      <div className="cf-field">
        <label htmlFor="cf-business">{words.businessLabel}{needBusiness ? null : <> <span className="cf-optional">{words.optional}</span></>}</label>
        <input {...a11y('business')} type="text" autoComplete="organization" required={needBusiness} maxLength={CONTACT_LIMITS.business} placeholder={words.businessPlaceholder} value={v.business} onChange={e => set('business', e.target.value)} />
        {err('business')}
      </div>
      <div className="cf-field">
        <label htmlFor="cf-message">{words.messageLabel}</label>
        <textarea {...a11y('message')} required rows={7} maxLength={CONTACT_LIMITS.messageMax} value={v.message} onChange={e => set('message', e.target.value)} />
        {err('message')}
      </div>
      {/* The trap: no person sees, hears or tabs to it. */}
      <div className="cf-trap" aria-hidden="true">
        <input ref={trap} type="text" name={CONTACT_TRAP_FIELD} tabIndex={-1} autoComplete="off" defaultValue="" />
      </div>
      <div className="cf-send">
        <button type="submit" className="btn btn-primary btn-lg" disabled={state === 'sending'} aria-describedby={formError ? 'cf-form-error' : undefined}>
          {state === 'sending' ? words.sending : words.send}
        </button>
        {formError ? <p className="cf-error" id="cf-form-error" role="alert">{words.errors[formError]}</p> : null}
      </div>
      <p className="cf-privacy">{words.privacyLine} <a href={privacyHref}>{words.privacyLink}</a></p>
    </form>
  )
}
