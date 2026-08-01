import React, { useEffect, useState } from 'react';
import API from '../utils/api';

let plansRequest;
const providerMeta = { payzy: { label: 'Payzy', mark: '🟣' }, koko: { label: 'Koko', mark: '🔵' } };
export default function InstallmentPlans({ amount, className = '', compact = false }) {
  const [plans, setPlans] = useState([]);
  useEffect(() => {
    if (!plansRequest) plansRequest = API.get('/payments/gateways', { cache: false }).then(r => (r.data || []).flatMap(g => g.installmentPlans || [])).catch(() => []);
    plansRequest.then(setPlans);
  }, []);
  if (!amount || !plans.length) return null;
  return <div className={`${compact ? 'mt-1 space-y-0.5' : 'mt-2 space-y-1'} ${className}`}>
    {plans.slice(0, 3).map((plan, i) => { const provider = providerMeta[plan.provider] || { label: plan.provider || 'Installment', mark: '💳' }; const months = Math.max(1, Number(plan.months) || 1); const monthly = Number(amount) * (1 + Number(plan.interestRate || 0) / 100) / months; return <div key={`${plan.provider}-${i}`} className="flex items-center gap-1.5 text-xs text-gray-500">{plan.providerLogo ? <img src={plan.providerLogo} alt={provider.label} className="h-4 w-auto object-contain" onError={e => { e.currentTarget.style.display='none'; }} /> : <span aria-hidden="true">{provider.mark}</span>}<span><strong>{months} × {monthly.toFixed(2)}</strong> with {provider.label}</span></div>; })}
  </div>;
}
