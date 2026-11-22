import React, { useEffect, useMemo, useState } from 'react';
import { Calculator, X } from 'lucide-react';

interface CalcState {
  x: string;
  done: boolean;
  prev: string;
  err: boolean;
}

const isOp = (c: string) => '+-*/'.includes(c);

function evalCalcExpr(raw: string): number | null {
  let s = raw;
  while (s && isOp(s.slice(-1))) s = s.slice(0, -1);
  const tokens = s.match(/\d+\.?\d*|\.\d+|[+\-*/]/g);
  if (!tokens) return null;
  if (tokens[0] === '-') {
    tokens.shift();
    if (!tokens.length) return null;
    tokens[0] = '-' + tokens[0];
  }
  if (tokens.length % 2 === 0) return null;

  const nums = [Number(tokens[0])];
  const ops: string[] = [];
  for (let i = 1; i < tokens.length; i += 2) {
    const op = tokens[i];
    const v = Number(tokens[i + 1]);
    if (op === '*') nums[nums.length - 1] *= v;
    else if (op === '/') nums[nums.length - 1] /= v;
    else {
      ops.push(op);
      nums.push(v);
    }
  }
  let res = nums[0];
  ops.forEach((op, idx) => {
    res = op === '+' ? res + nums[idx + 1] : res - nums[idx + 1];
  });
  return Number.isFinite(res) ? parseFloat(res.toPrecision(12)) : Number.NaN;
}

function fixFloatStr(v: number): string {
  let s = v.toFixed(10);
  if (s.includes('.')) s = s.replace(/\.?0+$/, '');
  return Number(s) === 0 ? '0' : s;
}

function stepCalc(state: CalcState, k: string): CalcState {
  let { x, done, prev, err } = state;
  const resetDone = () => {
    done = false;
    prev = '';
  };

  if (err) {
    x = '';
    err = false;
    resetDone();
  }

  if (k === 'C') {
    x = '';
    resetDone();
  } else if (k === 'D') {
    x = x.slice(0, -1);
    resetDone();
  } else if (k === '=') {
    const v = /\d[+\-*/]/.test(x) ? evalCalcExpr(x) : null;
    if (v !== null) {
      if (Number.isNaN(v) || Math.abs(v) >= 1e15) {
        err = true;
      } else {
        prev = x;
        x = fixFloatStr(v);
        done = true;
      }
    }
  } else if (x.length < 40) {
    if (isOp(k)) {
      if (done) resetDone();
      if (x === '') {
        if (k === '-') x = '-';
      } else if (x !== '-') {
        if (isOp(x.slice(-1))) x = x.slice(0, -1) + k;
        else x += k;
      }
    } else if (k === '.') {
      if (done) {
        x = '';
        resetDone();
      }
      const m = (x.match(/[\d.]*$/) || [''])[0];
      if (!m.includes('.')) x += m === '' ? '0.' : '.';
    } else {
      if (done) {
        x = '';
        resetDone();
      }
      x = x.replace(/(^|[+\-*/])0$/, '$1') + k;
    }
  }

  return { x, done, prev, err };
}

const KEYS: { k: string; label: string; style: 'clear' | 'op' | 'eq' | 'zero' | 'num' }[] = [
  { k: 'C', label: 'C', style: 'clear' },
  { k: 'D', label: 'Del', style: 'clear' },
  { k: '/', label: '÷', style: 'op' },
  { k: '*', label: '×', style: 'op' },
  { k: '7', label: '7', style: 'num' },
  { k: '8', label: '8', style: 'num' },
  { k: '9', label: '9', style: 'num' },
  { k: '-', label: '−', style: 'op' },
  { k: '4', label: '4', style: 'num' },
  { k: '5', label: '5', style: 'num' },
  { k: '6', label: '6', style: 'num' },
  { k: '+', label: '+', style: 'op' },
  { k: '1', label: '1', style: 'num' },
  { k: '2', label: '2', style: 'num' },
  { k: '3', label: '3', style: 'num' },
  { k: '=', label: '=', style: 'eq' },
  { k: '0', label: '0', style: 'zero' },
  { k: '.', label: ',', style: 'num' },
];

const formatExpr = (t: string) =>
  t.replace(/\*/g, '×').replace(/\//g, '÷').replace(/-/g, '−').replace(/\./g, ',');

const formatNumBR = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 10 });

export const FloatingCalculator: React.FC<{ isDark?: boolean }> = ({ isDark = false }) => {
  const [open, setOpen] = useState(false);
  const [calc, setCalc] = useState<CalcState>({ x: '', done: false, prev: '', err: false });

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        setOpen(false);
        return;
      }
      const keyMap: Record<string, string> = {
        Enter: '=',
        '=': '=',
        ',': '.',
        '.': '.',
        Backspace: 'D',
        Delete: 'C',
        c: 'C',
        C: 'C',
      };
      const k = /^[0-9+\-*/]$/.test(e.key) ? e.key : keyMap[e.key];
      if (k) {
        e.preventDefault();
        setCalc((prev) => stepCalc(prev, k));
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open]);

  const { exprDisplay, resultDisplay } = useMemo(() => {
    const hasOp = /\d[+\-*/]/.test(calc.x);
    let expr = '';
    let result = '0';
    if (calc.err) {
      result = 'Erro';
    } else if (calc.done) {
      expr = `${formatExpr(calc.prev)} =`;
      result = formatNumBR(Number(calc.x));
    } else if (hasOp) {
      const v = evalCalcExpr(calc.x);
      expr = formatExpr(calc.x);
      result = v === null ? '0' : Number.isNaN(v) ? 'Erro' : formatNumBR(v);
    } else {
      result = formatExpr(calc.x) || '0';
    }
    return {
      exprDisplay: expr.length > 34 ? `…${expr.slice(-33)}` : expr,
      resultDisplay: result,
    };
  }, [calc]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title="Calculadora rápida"
        aria-label="Abrir calculadora"
        className={`fixed bottom-18 lg:bottom-5 right-4 z-[65] w-11 h-11 rounded-2xl shadow-lg flex items-center justify-center transition-transform hover:scale-105 cursor-pointer print:hidden ${
          isDark
            ? 'bg-[#131B2E] border border-[#06B6D4]/60 text-[#06B6D4] hover:bg-[#1a243b]'
            : 'bg-[#091b36] text-white hover:bg-[#0056ab]'
        }`}
      >
        <Calculator className="w-5 h-5" />
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="false"
          aria-label="Calculadora"
          className="fixed bottom-32 lg:bottom-20 right-4 z-[70] w-72 rounded-2xl bg-white border border-[#D9E0EC] shadow-2xl overflow-hidden text-[#091b36] print:hidden"
        >
          <div className="px-4 py-2.5 bg-[#091b36] text-white flex items-center justify-between">
            <span className="text-xs font-bold flex items-center gap-1.5">
              <Calculator className="w-3.5 h-3.5 text-[#06B6D4]" />
              <span>Calculadora</span>
            </span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Fechar calculadora"
              className="p-1 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div
            aria-live="polite"
            className="px-4 py-3 bg-[#F3F6FB] border-b border-[#D9E0EC] text-right font-mono"
          >
            <div className="text-[11px] text-[#727784] min-h-[16px] truncate">
              {exprDisplay || '\u00a0'}
            </div>
            <div className="text-2xl font-bold text-[#091b36] tabular-nums truncate">
              {resultDisplay}
            </div>
          </div>

          <div className="p-3 grid grid-cols-4 gap-1.5">
            {KEYS.map((item) => {
              const spanClass =
                item.style === 'eq'
                  ? 'row-span-2 bg-[#0056ab] text-white hover:bg-[#1b6fd1]'
                  : item.style === 'zero'
                    ? 'col-span-2 bg-[#F3F6FB] text-[#091b36] hover:bg-[#e5ebf5]'
                    : item.style === 'clear'
                      ? 'bg-[#FEE2E2]/70 text-[#B91C1C] hover:bg-[#FEE2E2]'
                      : item.style === 'op'
                        ? 'bg-[#EAF2FD] text-[#0056ab] hover:bg-[#d8e7fb]'
                        : 'bg-[#F3F6FB] text-[#091b36] hover:bg-[#e5ebf5]';
              return (
                <button
                  key={item.k}
                  type="button"
                  onClick={() => setCalc((prev) => stepCalc(prev, item.k))}
                  className={`h-10 rounded-xl font-bold text-sm transition-colors cursor-pointer ${spanClass}`}
                >
                  {item.label}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
};
