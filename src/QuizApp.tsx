import { useState, useCallback, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import Anthropic from '@anthropic-ai/sdk'
import { QRCodeSVG } from 'qrcode.react'
import { saveScoreRemote, getScoresRemote, saveQuizRemote, getQuizRemote } from './supabase'
import {
  FileText,
  Sparkle,
  ArrowCounterClockwise,
  Copy,
  CheckCircle,
  XCircle,
  Trophy,
  X,
  CircleNotch,
  BookOpen,
  WarningCircle,
  QrCode,
  UserCircle,
  ArrowRight,
  Crown,
  Medal,
} from '@phosphor-icons/react'

// ─── Types ────────────────────────────────────────────────────────────────────
interface Option { id: string; text: string }
interface Question {
  id: number
  question: string
  options: Option[]
  correctId: string
  explanation: string
}
interface QuizData { title: string; questions: Question[] }
interface RankingEntry { name: string; score: number; total: number; timestamp: number }

type AppState = 'input' | 'loading' | 'host' | 'name' | 'quiz' | 'result'

const DAYS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta'] as const
type Day = typeof DAYS[number]

// ─── Helpers ──────────────────────────────────────────────────────────────────
async function saveScore(id: string, entry: RankingEntry) {
  await saveScoreRemote({ quiz_id: id, player_name: entry.name, score: entry.score, total: entry.total })
}
async function getScores(id: string): Promise<RankingEntry[]> {
  const rows = await getScoresRemote(id)
  return rows.map(r => ({ name: r.player_name, score: r.score, total: r.total, timestamp: new Date(r.created_at ?? 0).getTime() }))
}

// ─── AI Generation ────────────────────────────────────────────────────────────
async function generateQuizFromText(text: string): Promise<QuizData> {
  const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY
  if (!apiKey || apiKey === 'sua_chave_aqui') throw new Error('MISSING_KEY')

  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true })
  const prompt = `Você é um professor especialista em criar avaliações. Com base no texto abaixo, crie exatamente 7 perguntas de múltipla escolha em português.

TEXTO:
${text}

Retorne SOMENTE um JSON válido neste formato exato, sem nenhum texto fora do JSON:
{
  "title": "Título resumido do tema do texto",
  "questions": [
    {
      "id": 1,
      "question": "Pergunta clara e objetiva sobre o conteúdo?",
      "options": [
        { "id": "a", "text": "Opção A" },
        { "id": "b", "text": "Opção B" },
        { "id": "c", "text": "Opção C" },
        { "id": "d", "text": "Opção D" }
      ],
      "correctId": "b",
      "explanation": "Breve explicação do porquê esta é a resposta correta, citando o texto."
    }
  ]
}

Regras:
- Perguntas baseadas EXCLUSIVAMENTE no texto.
- Exatamente 4 opções (a, b, c, d) por pergunta.
- Variar entre compreensão, inferência e interpretação.
- Retorne APENAS o JSON, sem markdown, sem blocos de código.`

  const message = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4096,
    messages: [{ role: 'user', content: prompt }],
  }).catch((e) => { console.error('Anthropic API error:', e?.status, e?.message, e?.error); throw e })

  const raw = message.content[0].type === 'text' ? message.content[0].text : ''
  const cleaned = raw.replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/i, '').trim()
  return JSON.parse(cleaned) as QuizData
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────
function SkeletonCard() {
  return (
    <div className="bg-white rounded-2xl p-6 shadow-[0_1px_4px_rgba(0,0,0,0.06)] border border-gray-100 animate-pulse">
      <div className="h-3 bg-gray-100 rounded-full w-16 mb-4" />
      <div className="h-5 bg-gray-100 rounded-full w-3/4 mb-2" />
      <div className="h-5 bg-gray-100 rounded-full w-1/2 mb-6" />
      <div className="space-y-3">
        {[1, 2, 3, 4].map((i) => <div key={i} className="h-11 bg-gray-50 rounded-xl border border-gray-100" />)}
      </div>
    </div>
  )
}

// ─── Progress Bar ─────────────────────────────────────────────────────────────
function ProgressBar({ current, total }: { current: number; total: number }) {
  const pct = Math.round((current / total) * 100)
  return (
    <div className="w-full h-0.5 bg-gray-100 rounded-full overflow-hidden">
      <motion.div className="h-full bg-orange-600 rounded-full"
        initial={{ width: 0 }} animate={{ width: `${pct}%` }}
        transition={{ duration: 0.5, ease: 'easeInOut' }} />
    </div>
  )
}

// ─── Input Screen ─────────────────────────────────────────────────────────────
function InputScreen({ dayTexts, onTextChange, onGenerate, error }: {
  dayTexts: Record<Day, string>
  onTextChange: (day: Day, v: string) => void
  onGenerate: () => void
  error: string | null
}) {
  const maxCharsPerDay = 40000
  const anyFilled = DAYS.some((d) => dayTexts[d].trim().length > 0)
  const anyOverLimit = DAYS.some((d) => dayTexts[d].length > maxCharsPerDay)
  const totalChars = DAYS.reduce((s, d) => s + dayTexts[d].length, 0)

  return (
    <motion.div key="input" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -16 }} transition={{ duration: 0.3 }} className="w-full max-w-2xl mx-auto">
      <div className="text-center mb-10">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-orange-50 mb-5">
          <BookOpen size={26} weight="light" className="text-orange-700" />
        </div>
        <h1 className="text-3xl font-semibold text-gray-900 tracking-tight mb-2">QuizzUp</h1>
        <p className="text-base text-gray-400">Cole as lições de cada dia e gere 7 perguntas da semana</p>
      </div>

      <AnimatePresence>
        {error && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
            className="flex items-start gap-3 bg-red-50 border border-red-100 rounded-2xl px-5 py-4 mb-5 text-sm text-red-600">
            <WarningCircle size={16} weight="light" className="shrink-0 mt-0.5" />
            <span>{error}</span>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="space-y-3">
        {DAYS.map((day) => {
          const text = dayTexts[day]
          const overLimit = text.length > maxCharsPerDay
          return (
            <div key={day} className="bg-white rounded-2xl border border-gray-100 shadow-[0_1px_6px_rgba(0,0,0,0.05)] overflow-hidden">
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-50">
                <div className="flex items-center gap-2.5">
                  <FileText size={15} weight="light" className="text-orange-400" />
                  <span className="text-sm font-medium text-gray-700">{day}</span>
                  {text.trim() && (
                    <span className="text-xs text-orange-400 bg-orange-50 px-2 py-0.5 rounded-full">
                      {text.length.toLocaleString('pt-BR')} car.
                    </span>
                  )}
                </div>
                {text && (
                  <button onClick={() => onTextChange(day, '')}
                    className="flex items-center gap-1 text-xs text-gray-300 hover:text-gray-500 transition-colors">
                    <X size={12} weight="light" />Limpar
                  </button>
                )}
              </div>
              <textarea value={text} onChange={(e) => onTextChange(day, e.target.value)}
                placeholder={`Texto da lição de ${day}...`}
                className={`w-full resize-none outline-none px-6 py-5 text-base text-gray-700 placeholder:text-gray-300 leading-relaxed min-h-[120px] ${overLimit ? 'bg-red-50/30' : ''}`}
                style={{ fontFamily: 'inherit' }} />
              {overLimit && (
                <div className="px-6 py-2 border-t border-red-100 text-xs text-red-400">
                  Limite excedido
                </div>
              )}
            </div>
          )
        })}
      </div>

      <div className="mt-6 flex flex-col gap-3">
        <motion.button whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }} onClick={onGenerate}
          disabled={!anyFilled || anyOverLimit}
          className="w-full flex items-center justify-center gap-2 bg-orange-700 hover:bg-orange-800 disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium py-4 rounded-2xl transition-colors shadow-[0_2px_12px_rgba(194,65,12,0.25)] text-base">
          <Sparkle size={17} weight="fill" />
          Gerar quiz da semana
        </motion.button>
        <p className="text-center text-xs text-gray-300">
          {anyFilled
            ? `${totalChars.toLocaleString('pt-BR')} caracteres · ${DAYS.filter(d => dayTexts[d].trim()).length} dia(s) preenchido(s)`
            : 'Preencha ao menos um dia para começar'}
        </p>
      </div>
    </motion.div>
  )
}

// ─── Loading Screen ───────────────────────────────────────────────────────────
function LoadingScreen() {
  return (
    <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="w-full max-w-2xl mx-auto">
      <div className="text-center mb-8">
        <div className="inline-flex items-center gap-2 text-sm text-gray-400 mb-2">
          <CircleNotch size={14} weight="light" className="animate-spin text-orange-600" />
          Analisando seu texto e criando perguntas...
        </div>
        <div className="w-32 h-0.5 bg-gray-100 rounded-full mx-auto overflow-hidden">
          <motion.div className="h-full bg-orange-400 rounded-full"
            animate={{ x: ['-100%', '200%'] }}
            transition={{ repeat: Infinity, duration: 1.2, ease: 'easeInOut' }} />
        </div>
      </div>
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <motion.div key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }}>
            <SkeletonCard />
          </motion.div>
        ))}
      </div>
    </motion.div>
  )
}

// ─── Host Screen ──────────────────────────────────────────────────────────────
function HostScreen({ quiz, quizUrl, qId, onBack }: {
  quiz: QuizData; quizUrl: string; qId: string; onBack: () => void
}) {
  const [copied, setCopied] = useState(false)
  const id = qId
  const [scores, setScores] = useState<RankingEntry[]>([])

  useEffect(() => {
    getScores(id).then(setScores)
    const interval = setInterval(() => getScores(id).then(setScores), 3000)
    return () => clearInterval(interval)
  }, [id])

  const sorted = [...scores].sort((a, b) => b.score - a.score || a.timestamp - b.timestamp)

  const handleCopy = () => {
    navigator.clipboard.writeText(quizUrl).then(() => {
      setCopied(true); setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <motion.div key="host" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -16 }} transition={{ duration: 0.35 }} className="w-full max-w-2xl mx-auto">

      <div className="text-center mb-6">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-orange-50 mb-4">
          <QrCode size={26} weight="light" className="text-orange-700" />
        </div>
        <h2 className="text-2xl font-semibold text-gray-900 tracking-tight mb-1">Quiz pronto!</h2>
        <p className="text-gray-400 text-base">{quiz.title}</p>
      </div>

      {/* QR Code */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-[0_1px_6px_rgba(0,0,0,0.05)] p-8 flex flex-col items-center mb-4">
        <div className="p-3 bg-white rounded-2xl border border-gray-200 mb-5">
          <QRCodeSVG value={quizUrl} size={200} fgColor="#1f2937" bgColor="#ffffff"
            level="M" includeMargin={false} />
        </div>
        <p className="text-sm text-gray-400 mb-3 text-center">
          Compartilhe o QR code — só quem escanear pode responder
        </p>
        <div className="flex items-center gap-2 w-full max-w-sm">
          <div className="flex-1 bg-gray-50 border border-gray-100 rounded-xl px-3 py-2 text-xs text-gray-400 truncate font-mono">
            {quizUrl}
          </div>
          <button onClick={handleCopy}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-orange-50 hover:bg-orange-100 text-orange-700 text-xs font-medium transition-colors shrink-0">
            {copied ? <CheckCircle size={13} weight="fill" /> : <Copy size={13} weight="light" />}
            {copied ? 'Copiado' : 'Copiar'}
          </button>
        </div>
      </div>

      {/* Ranking ao vivo */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-[0_1px_6px_rgba(0,0,0,0.05)] overflow-hidden mb-4">
        <div className="px-6 py-4 border-b border-gray-50 flex items-center gap-2">
          <Trophy size={15} weight="light" className="text-orange-600" />
          <span className="text-sm font-medium text-gray-700">Ranking ao vivo</span>
          <span className="text-xs text-gray-300 ml-auto">{sorted.length} participante(s)</span>
        </div>
        {sorted.length === 0 ? (
          <div className="px-6 py-8 text-center text-sm text-gray-300">
            Aguardando participantes...
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {sorted.slice(0, 10).map((e, i) => (
              <div key={i} className="flex items-center gap-3 px-6 py-3">
                <span className="text-sm w-6 text-center">
                  {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`}
                </span>
                <span className="flex-1 text-sm text-gray-700">{e.name}</span>
                <span className="text-sm font-medium text-orange-700">{e.score}/{e.total}</span>
                <span className="text-xs text-gray-300">{Math.round((e.score / e.total) * 100)}%</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <button onClick={onBack}
        className="w-full flex items-center justify-center gap-2 px-5 py-4 rounded-2xl border border-gray-200 bg-white hover:bg-gray-50 text-gray-600 text-sm font-medium transition-colors">
        <ArrowCounterClockwise size={14} weight="light" />
        Editar quiz
      </button>
    </motion.div>
  )
}

// ─── Name Screen ──────────────────────────────────────────────────────────────
function NameScreen({ quiz, onStart }: { quiz: QuizData; onStart: (name: string) => void }) {
  const [name, setName] = useState('')

  return (
    <motion.div key="name" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -16 }} transition={{ duration: 0.3 }} className="w-full max-w-md mx-auto">
      <div className="text-center mb-10">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-orange-50 mb-5">
          <UserCircle size={26} weight="light" className="text-orange-700" />
        </div>
        <h2 className="text-2xl font-semibold text-gray-900 tracking-tight mb-2">Como você quer ser chamado?</h2>
        <p className="text-gray-400 text-base">{quiz.title}</p>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-[0_1px_6px_rgba(0,0,0,0.05)] overflow-hidden mb-4">
        <input
          type="text" value={name} onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && name.trim() && onStart(name.trim())}
          placeholder="Seu nome ou apelido..."
          autoFocus
          className="w-full outline-none px-6 py-5 text-lg text-gray-800 placeholder:text-gray-300"
          style={{ fontFamily: 'inherit' }} maxLength={30}
        />
      </div>

      <motion.button whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }}
        onClick={() => name.trim() && onStart(name.trim())}
        disabled={!name.trim()}
        className="w-full flex items-center justify-center gap-2 bg-orange-700 hover:bg-orange-800 disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium py-4 rounded-2xl transition-colors shadow-[0_2px_12px_rgba(194,65,12,0.25)] text-base">
        <ArrowRight size={17} weight="bold" />
        Começar quiz
      </motion.button>
    </motion.div>
  )
}

// ─── Question Card ────────────────────────────────────────────────────────────
function QuestionCard({ question, index, total, onAnswer }: {
  question: Question; index: number; total: number; onAnswer: (correct: boolean) => void
}) {
  const [selected, setSelected] = useState<string | null>(null)
  const [countdown, setCountdown] = useState<number | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hasAnswered = useRef(false)

  useEffect(() => {
    if (countdown === null) return
    if (countdown === 0) {
      if (!hasAnswered.current) {
        hasAnswered.current = true
        onAnswer(selected === question.correctId)
      }
      return
    }
    timerRef.current = setTimeout(() => setCountdown((c) => (c ?? 1) - 1), 1000)
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [countdown, selected, question.correctId, onAnswer])

  const handleSelect = (id: string) => {
    if (selected) return
    setSelected(id)
    setCountdown(10)
  }

  const handleSkip = () => {
    if (hasAnswered.current) return
    hasAnswered.current = true
    if (timerRef.current) clearTimeout(timerRef.current)
    onAnswer(selected === question.correctId)
  }

  const getOptionStyle = (id: string) => {
    if (!selected) return 'border-gray-100 bg-white hover:border-orange-200 hover:bg-orange-50/50 cursor-pointer'
    if (id === question.correctId) return 'border-emerald-200 bg-emerald-50 text-emerald-800'
    if (id === selected && id !== question.correctId) return 'border-red-200 bg-red-50 text-red-700'
    return 'border-gray-100 bg-gray-50 text-gray-400'
  }

  const getOptionIcon = (id: string) => {
    if (!selected) return null
    if (id === question.correctId) return <CheckCircle size={15} weight="fill" className="text-emerald-500 shrink-0" />
    if (id === selected) return <XCircle size={15} weight="fill" className="text-red-400 shrink-0" />
    return null
  }

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20, scale: 0.98 }}
      transition={{ duration: 0.35, ease: [0.25, 0.46, 0.45, 0.94] }}
      className="bg-white rounded-2xl p-6 shadow-[0_1px_4px_rgba(0,0,0,0.06)] border border-gray-100">

      <div className="flex items-center justify-between mb-4">
        <span className="text-xs font-medium text-orange-700 bg-orange-50 px-2.5 py-1 rounded-full">
          Pergunta {index + 1} de {total}
        </span>
        <ProgressBar current={index} total={total} />
        <span className="text-xs text-gray-300 ml-4 tabular-nums">{Math.round((index / total) * 100)}%</span>
      </div>

      <h2 className="text-lg font-medium text-gray-900 leading-relaxed mb-5">{question.question}</h2>

      <div className="space-y-2.5">
        {question.options.map((opt) => (
          <motion.button key={opt.id} whileHover={!selected ? { x: 2 } : {}} whileTap={!selected ? { scale: 0.995 } : {}}
            onClick={() => handleSelect(opt.id)}
            className={`w-full flex items-center justify-between px-4 py-3.5 rounded-xl border text-base text-left transition-all duration-200 ${getOptionStyle(opt.id)}`}>
            <div className="flex items-center gap-3">
              <span className="text-xs font-medium text-gray-400 w-4 shrink-0 uppercase">{opt.id}</span>
              <span>{opt.text}</span>
            </div>
            {getOptionIcon(opt.id)}
          </motion.button>
        ))}
      </div>

      {/* Countdown + Explanation */}
      <AnimatePresence>
        {selected && (
          <motion.div initial={{ opacity: 0, height: 0, marginTop: 0 }}
            animate={{ opacity: 1, height: 'auto', marginTop: 16 }}
            exit={{ opacity: 0, height: 0, marginTop: 0 }} className="overflow-hidden space-y-3">

            <div className={`rounded-xl px-4 py-3 text-sm leading-relaxed ${
              selected === question.correctId
                ? 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                : 'bg-amber-50 text-amber-700 border border-amber-100'}`}>
              <strong className="font-medium">Explicação:</strong> {question.explanation}
            </div>

            {/* Countdown bar */}
            <div className="flex items-center gap-3">
              <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <motion.div className="h-full bg-orange-400 rounded-full"
                  initial={{ width: '100%' }}
                  animate={{ width: '0%' }}
                  transition={{ duration: 10, ease: 'linear' }} />
              </div>
              <span className="text-xs text-gray-400 tabular-nums w-16 text-right">
                {countdown !== null && countdown > 0 ? `${countdown}s` : ''}
              </span>
              <button onClick={handleSkip}
                className="text-xs text-orange-600 hover:text-orange-800 font-medium transition-colors shrink-0">
                Próxima →
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

// ─── Result Screen ────────────────────────────────────────────────────────────
function ResultScreen({ score, total, quiz, playerName, qId, isGuest, onRestart }: {
  score: number; total: number; quiz: QuizData; playerName: string; qId: string; isGuest: boolean; onRestart: () => void
}) {
  const [copied, setCopied] = useState(false)
  const pct = Math.round((score / total) * 100)
  const [scores, setScores] = useState<RankingEntry[]>([])
  useEffect(() => { getScores(qId).then(setScores) }, [qId])
  const sorted = [...scores].sort((a, b) => b.score - a.score || a.timestamp - b.timestamp)
  const myIndex = sorted.findIndex(e => e.name === playerName && e.score === score)
  const position = myIndex + 1

  const grade = pct >= 85
    ? { label: 'Excelente', color: 'text-emerald-600', bg: 'bg-emerald-50' }
    : pct >= 60
    ? { label: 'Bom', color: 'text-blue-600', bg: 'bg-blue-50' }
    : { label: 'Continue praticando', color: 'text-amber-600', bg: 'bg-amber-50' }

  const medalColor = (i: number) =>
    i === 0 ? 'text-amber-500' : i === 1 ? 'text-gray-400' : i === 2 ? 'text-amber-700' : 'text-gray-300'

  const handleCopyMarkdown = () => {
    const md = [
      `# ${quiz.title}`, '',
      ...quiz.questions.flatMap((q, i) => [
        `## ${i + 1}. ${q.question}`, '',
        ...q.options.map(o => `- ${o.id === q.correctId ? '**[CORRETO]** ' : ''}${o.id.toUpperCase()}) ${o.text}`),
        '', `> **Explicação:** ${q.explanation}`, '',
      ]),
    ].join('\n')
    navigator.clipboard.writeText(md).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000) })
  }

  return (
    <motion.div key="result" initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] }} className="w-full max-w-2xl mx-auto space-y-4">

      {/* Personal Score */}
      <div className="bg-white rounded-2xl p-5 sm:p-8 shadow-[0_1px_4px_rgba(0,0,0,0.06)] border border-gray-100 text-center">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-amber-50 mb-4">
          <Trophy size={24} weight="light" className="text-amber-500" />
        </div>
        <h2 className="text-2xl font-semibold text-gray-900 tracking-tight mb-1">Quiz concluído!</h2>
        <p className="text-base text-gray-500 mb-1">{playerName}</p>
        <p className="text-sm text-gray-300 mb-6">{quiz.title}</p>

        <div className="flex items-center justify-center gap-5 sm:gap-10 mb-6">
          <div className="text-center shrink-0">
            <div className="text-3xl sm:text-4xl font-light text-gray-800 tabular-nums">
              {score}<span className="text-base sm:text-lg text-gray-300">/{total}</span>
            </div>
            <div className="text-xs text-gray-400 mt-1">acertos</div>
          </div>
          <div className="w-px h-10 bg-gray-100 shrink-0" />
          <div className="text-center shrink-0">
            <div className="text-3xl sm:text-4xl font-light text-gray-800 tabular-nums">
              {pct}<span className="text-base sm:text-lg text-gray-300">%</span>
            </div>
            <div className="text-xs text-gray-400 mt-1">aproveitamento</div>
          </div>
          <div className="w-px h-10 bg-gray-100 shrink-0" />
          <div className={`text-center px-3 py-1 rounded-full shrink-0 ${grade.bg}`}>
            <div className={`text-xs sm:text-sm font-medium whitespace-nowrap ${grade.color}`}>{grade.label}</div>
          </div>
        </div>

        {position > 0 && (
          <div className="inline-flex items-center gap-2 bg-orange-50 text-orange-700 px-4 py-2 rounded-full text-sm font-medium">
            <Medal size={15} weight="fill" />
            {position}º lugar no ranking
          </div>
        )}

        <div className="w-full h-1 bg-gray-100 rounded-full overflow-hidden mt-5">
          <motion.div className="h-full bg-orange-600 rounded-full" initial={{ width: 0 }}
            animate={{ width: `${pct}%` }} transition={{ duration: 0.8, ease: 'easeOut', delay: 0.2 }} />
        </div>
      </div>

      {/* Ranking */}
      {sorted.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-[0_1px_6px_rgba(0,0,0,0.05)] overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-50 flex items-center gap-2">
            <Crown size={15} weight="fill" className="text-amber-500" />
            <span className="text-sm font-medium text-gray-700">Ranking geral</span>
            <span className="text-xs text-gray-300 ml-auto">{sorted.length} participante(s)</span>
          </div>
          <div className="divide-y divide-gray-50">
            {sorted.map((e, i) => {
              const isMe = e.name === playerName && e.score === score && i === myIndex
              return (
                <motion.div key={i} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className={`flex items-center gap-3 px-6 py-3.5 ${isMe ? 'bg-orange-50' : ''}`}>
                  <span className={`text-sm font-bold w-6 text-center ${medalColor(i)}`}>
                    {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`}
                  </span>
                  <span className={`flex-1 min-w-0 text-sm truncate ${isMe ? 'font-semibold text-orange-800' : 'text-gray-700'}`}>
                    {e.name} {isMe && <span className="text-xs font-normal text-orange-400 whitespace-nowrap">(você)</span>}
                  </span>
                  <span className="text-sm font-medium text-gray-700 shrink-0">{e.score}/{e.total}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${
                    Math.round((e.score / e.total) * 100) >= 85 ? 'bg-emerald-50 text-emerald-600' :
                    Math.round((e.score / e.total) * 100) >= 60 ? 'bg-blue-50 text-blue-600' :
                    'bg-gray-50 text-gray-400'}`}>
                    {Math.round((e.score / e.total) * 100)}%
                  </span>
                </motion.div>
              )
            })}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3">
        {!isGuest && (
          <motion.button whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }} onClick={onRestart}
            className="flex-1 flex items-center justify-center gap-2 bg-white hover:bg-gray-50 text-gray-600 text-sm font-medium py-4 rounded-2xl border border-gray-200 transition-colors whitespace-nowrap">
            <ArrowCounterClockwise size={14} weight="light" />
            Novo quiz
          </motion.button>
        )}
        <motion.button whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }} onClick={handleCopyMarkdown}
          className="flex-1 flex items-center justify-center gap-2 bg-orange-700 hover:bg-orange-800 text-white text-sm font-medium py-4 rounded-2xl transition-colors shadow-[0_2px_8px_rgba(194,65,12,0.25)] whitespace-nowrap">
          {copied ? <><CheckCircle size={14} weight="fill" />Copiado!</> : <><Copy size={14} weight="light" />Copiar em Markdown</>}
        </motion.button>
      </div>
    </motion.div>
  )
}

// ─── Main App ─────────────────────────────────────────────────────────────────
const emptyDayTexts = () => Object.fromEntries(DAYS.map((d) => [d, ''])) as Record<Day, string>

export default function QuizApp() {
  const [appState, setAppState] = useState<AppState>('input')
  const [dayTexts, setDayTexts] = useState<Record<Day, string>>(emptyDayTexts)
  const [quiz, setQuiz] = useState<QuizData | null>(null)
  const [quizUrl, setQuizUrl] = useState('')
  const [qId, setQId] = useState('')
  const [playerName, setPlayerName] = useState('')
  const [currentQuestion, setCurrentQuestion] = useState(0)
  const [score, setScore] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [isGuest, setIsGuest] = useState(false)

  // On load: check URL for shared quiz
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const id = params.get('id')
    if (id) {
      setIsGuest(true)
      setQId(id)
      getQuizRemote(id).then((data) => {
        if (data) { setQuiz(data as QuizData); setAppState('name') }
      })
    }
  }, [])

  const handleTextChange = useCallback((day: Day, v: string) => {
    setDayTexts((prev) => ({ ...prev, [day]: v }))
  }, [])

  const handleGenerate = useCallback(async () => {
    setError(null)
    setAppState('loading')
    setCurrentQuestion(0)
    setScore(0)

    const combined = DAYS
      .filter((d) => dayTexts[d].trim())
      .map((d) => `## ${d}\n${dayTexts[d].trim()}`)
      .join('\n\n')

    try {
      const data = await generateQuizFromText(combined)
      const id = await saveQuizRemote(data)
      const url = `${window.location.origin}${window.location.pathname}?id=${id}`
      setQuiz(data)
      setQuizUrl(url)
      setQId(id)
      setAppState('host')
    } catch (err) {
      let msg = 'Erro ao gerar o quiz. Tente novamente.'
      if (err instanceof Error) {
        if (err.message === 'MISSING_KEY') msg = 'Chave da API não configurada. Abra o arquivo .env.'
        else if (err.message.includes('401')) msg = 'API Key inválida. Verifique o arquivo .env e reinicie o servidor.'
        else if (err.message.includes('429')) msg = 'Limite de requisições atingido. Aguarde e tente novamente.'
      }
      setError(msg)
      setAppState('input')
    }
  }, [dayTexts])

  const handleStartQuiz = useCallback((name: string) => {
    setPlayerName(name)
    setCurrentQuestion(0)
    setScore(0)
    setAppState('quiz')
  }, [])

  const handleAnswer = useCallback((correct: boolean) => {
    const newScore = correct ? score + 1 : score
    if (correct) setScore(newScore)
    if (!quiz) return
    const isLast = currentQuestion + 1 >= quiz.questions.length
    if (isLast) {
      const finalScore = correct ? score + 1 : score
      saveScore(qId, { name: playerName, score: finalScore, total: quiz.questions.length, timestamp: Date.now() })
      setTimeout(() => setAppState('result'), 300)
    } else {
      setTimeout(() => setCurrentQuestion((q) => q + 1), 300)
    }
  }, [currentQuestion, quiz, score, playerName, qId])

  const handleRestart = useCallback(() => {
    setAppState('input')
    setCurrentQuestion(0)
    setScore(0)
    setQuiz(null)
    setQuizUrl('')
    setQId('')
    setPlayerName('')
    setError(null)
    window.history.replaceState({}, '', window.location.pathname)
  }, [])

  return (
    <div className="min-h-screen bg-[#faf9f7] flex flex-col">
      {appState === 'quiz' && quiz && (
        <div className="fixed top-0 left-0 right-0 z-50">
          <ProgressBar current={currentQuestion} total={quiz.questions.length} />
        </div>
      )}

      <main className="flex-1 flex items-start justify-center px-4 pt-12 pb-16">
        <div className="w-full max-w-2xl">
          <AnimatePresence mode="wait">
            {appState === 'input' && (
              <InputScreen key="input" dayTexts={dayTexts} onTextChange={handleTextChange}
                onGenerate={handleGenerate} error={error} />
            )}
            {appState === 'loading' && <LoadingScreen key="loading" />}
            {appState === 'host' && quiz && (
              <HostScreen key="host" quiz={quiz} quizUrl={quizUrl} qId={qId}
                onBack={() => setAppState('input')} />
            )}
            {appState === 'name' && quiz && (
              <NameScreen key="name" quiz={quiz} onStart={handleStartQuiz} />
            )}
            {appState === 'quiz' && quiz && (
              <QuestionCard key={currentQuestion} question={quiz.questions[currentQuestion]}
                index={currentQuestion} total={quiz.questions.length} onAnswer={handleAnswer} />
            )}
            {appState === 'result' && quiz && (
              <ResultScreen key="result" score={score} total={quiz.questions.length}
                quiz={quiz} playerName={playerName} qId={qId} isGuest={isGuest} onRestart={handleRestart} />
            )}
          </AnimatePresence>
        </div>
      </main>
    </div>
  )
}
