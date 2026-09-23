import React, { useState, useMemo } from 'react';
import { 
  TrendingUp, 
  DollarSign, 
  Calendar, 
  Sparkles, 
  BarChart2, 
  Layers, 
  ArrowUpRight, 
  ArrowDownRight, 
  Info, 
  Download, 
  Search,
  Zap,
  HelpCircle,
  Gem,
  Award,
  CheckCircle2
} from 'lucide-react';
import { 
  ResponsiveContainer, 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  Tooltip, 
  CartesianGrid, 
  ReferenceLine, 
  Legend, 
  Cell 
} from 'recharts';
import { getAppointmentDateString, normalizeStatus, getAppointmentRevenue } from '../lib/dashboardUtils';
import { cn } from '../lib/utils';

export interface TreatmentAnalyticsSectionProps {
  rawAppointments: any[];
  rawEvolutions: any[];
  treatments: any[];
  selectedMonths: string[];
  timeframeLabel: string;
}

export type TreatmentSortKey = 'total_revenue' | 'most_expensive' | 'total_turns' | 'revenue_per_turn_given';
export type TreatmentChartView = 'comparison_bars' | 'revenue_per_turn' | 'prices_view';

export interface TreatmentMetric {
  id: string;
  name: string;
  catalogPrice: number;
  catalogDuration: number;
  unitPrice: number; // Precio unitario de referencia (el más caro/ponderado)
  totalAppointments: number; // Cantidad de turnos dados (el más pedido)
  finishedAppointments: number; // Turnos concluidos/atendidos
  pendingAppointments: number;
  absentAppointments: number;
  canceledAppointments: number;
  attendanceRate: number; // % asistencia
  totalRevenue: number; // Facturación total cobrada (líder en facturación)
  projectedRevenue: number;
  turnShare: number; // % sobre el total de turnos dados
  revenueShare: number; // % sobre la facturación de la clínica
  revenuePerTurnGiven: number; // Facturación total ÷ turnos dados
  revenuePerTurnFinished: number; // Facturación total ÷ turnos atendidos
  valueRatio: number; // Ratio vs promedio general por turno
  isTopRevenue: boolean; // Líder en facturación (el que más factura)
  isMostExpensive: boolean; // El más ponderado (el más caro)
  isMostRequested: boolean; // El tratamiento más pedido (el que más turnos dimos)
}

export const TreatmentAnalyticsSection: React.FC<TreatmentAnalyticsSectionProps> = ({
  rawAppointments,
  rawEvolutions,
  treatments,
  selectedMonths,
  timeframeLabel
}) => {
  const [sortKey, setSortKey] = useState<TreatmentSortKey>('total_revenue');
  const [chartView, setChartView] = useState<TreatmentChartView>('comparison_bars');
  const [searchTerm, setSearchTerm] = useState('');
  const [showMethodologyHelp, setShowMethodologyHelp] = useState(false);

  // Filter appointments for the selected timeframe
  const periodAppointments = useMemo(() => {
    return rawAppointments.filter(app => {
      const dStr = getAppointmentDateString(app);
      return dStr && selectedMonths.some(m => dStr.startsWith(m));
    });
  }, [rawAppointments, selectedMonths]);

  // Aggregate and compute metrics per treatment
  const { 
    metricsList, 
    clinicTotalAppointments, 
    clinicTotalFinished, 
    clinicTotalRevenue, 
    clinicAvgPerTurnGiven,
    clinicAvgPerTurnFinished,
    topRevenueTreatment,
    mostExpensiveTreatment,
    mostRequestedTreatment
  } = useMemo(() => {
    // Lookup catalog treatments map
    const catalogMap = new Map<string, any>();
    treatments.forEach(t => {
      if (t.name) catalogMap.set(t.name.trim().toLowerCase(), t);
      if (t.id) catalogMap.set(t.id, t);
    });

    // Group appointments by treatment canonical name
    const grouped = new Map<string, {
      id: string;
      name: string;
      catalogPrice: number;
      catalogDuration: number;
      totalAppointments: number;
      finishedAppointments: number;
      pendingAppointments: number;
      absentAppointments: number;
      canceledAppointments: number;
      totalRevenue: number;
      projectedRevenue: number;
    }>();

    let totalClinicApps = 0;
    let totalClinicFinished = 0;
    let totalClinicRev = 0;

    periodAppointments.forEach(app => {
      const rawName = (app.type || app.treatment || app.treatmentName || '').trim();
      const matchedCatalog = catalogMap.get(app.treatmentId) || 
                             catalogMap.get(rawName.toLowerCase()) || 
                             null;

      const canonicalName = matchedCatalog?.name || rawName || 'Consulta General';
      const key = canonicalName.toLowerCase();

      if (!grouped.has(key)) {
        grouped.set(key, {
          id: matchedCatalog?.id || app.treatmentId || key,
          name: canonicalName,
          catalogPrice: Number(matchedCatalog?.cost || app.cost || app.price || 0),
          catalogDuration: Number(matchedCatalog?.duration || app.duration || 30),
          totalAppointments: 0,
          finishedAppointments: 0,
          pendingAppointments: 0,
          absentAppointments: 0,
          canceledAppointments: 0,
          totalRevenue: 0,
          projectedRevenue: 0
        });
      }

      const item = grouped.get(key)!;
      item.totalAppointments += 1;
      totalClinicApps += 1;

      const norm = normalizeStatus(app.status);
      if (norm === 'finished') {
        item.finishedAppointments += 1;
        totalClinicFinished += 1;
        const rev = getAppointmentRevenue(app, treatments, rawEvolutions);
        item.totalRevenue += rev;
        totalClinicRev += rev;
      } else if (norm === 'pending') {
        item.pendingAppointments += 1;
        const proj = Number(app.paidAmount ?? app.cost ?? app.price ?? item.catalogPrice ?? 0);
        item.projectedRevenue += proj;
      } else if (norm === 'absent') {
        item.absentAppointments += 1;
      } else if (norm === 'canceled') {
        item.canceledAppointments += 1;
      }
    });

    // Include catalog treatments that may have 0 appointments in this period
    treatments.forEach(t => {
      if (!t.name) return;
      const key = t.name.trim().toLowerCase();
      if (!grouped.has(key)) {
        grouped.set(key, {
          id: t.id || key,
          name: t.name.trim(),
          catalogPrice: Number(t.cost || 0),
          catalogDuration: Number(t.duration || 30),
          totalAppointments: 0,
          finishedAppointments: 0,
          pendingAppointments: 0,
          absentAppointments: 0,
          canceledAppointments: 0,
          totalRevenue: 0,
          projectedRevenue: 0
        });
      }
    });

    // Clinic benchmarks
    const avgPerTurnGiven = totalClinicApps > 0 ? Math.round(totalClinicRev / totalClinicApps) : 0;
    const avgPerTurnFinished = totalClinicFinished > 0 ? Math.round(totalClinicRev / totalClinicFinished) : 0;

    // Build metric array
    const rawList: TreatmentMetric[] = Array.from(grouped.values()).map(g => {
      const turnShare = totalClinicApps > 0 ? (g.totalAppointments / totalClinicApps) * 100 : 0;
      const revenueShare = totalClinicRev > 0 ? (g.totalRevenue / totalClinicRev) * 100 : 0;

      // Yield per turn given
      let perTurnGiven = 0;
      if (g.totalAppointments > 0) {
        perTurnGiven = Math.round(g.totalRevenue / g.totalAppointments);
      } else if (g.catalogPrice > 0) {
        perTurnGiven = g.catalogPrice;
      }

      // Yield per turn finished
      let perTurnFinished = 0;
      if (g.finishedAppointments > 0) {
        perTurnFinished = Math.round(g.totalRevenue / g.finishedAppointments);
      } else if (g.catalogPrice > 0) {
        perTurnFinished = g.catalogPrice;
      }

      // Effective unit price (precio de catálogo o ticket unitario más alto de referencia)
      const unitPrice = g.catalogPrice > 0 ? g.catalogPrice : (perTurnFinished > 0 ? perTurnFinished : perTurnGiven);

      // Ratio vs clinic average ticket
      let ratio = 1;
      if (avgPerTurnFinished > 0) {
        ratio = Number((unitPrice / avgPerTurnFinished).toFixed(2));
      } else if (unitPrice > 0) {
        ratio = 1;
      }

      // Attendance rate
      const concluded = g.finishedAppointments + g.absentAppointments;
      const attRate = concluded > 0 ? Math.round((g.finishedAppointments / concluded) * 100) : (g.totalAppointments > 0 ? 100 : 0);

      return {
        ...g,
        unitPrice,
        turnShare: Number(turnShare.toFixed(1)),
        revenueShare: Number(revenueShare.toFixed(1)),
        revenuePerTurnGiven: perTurnGiven,
        revenuePerTurnFinished: perTurnFinished,
        attendanceRate: attRate,
        valueRatio: ratio,
        isTopRevenue: false,
        isMostExpensive: false,
        isMostRequested: false
      };
    });

    // 1. Líder en Facturación: El tratamiento que más facture
    let maxRev = -1;
    let topRevItem: TreatmentMetric | null = null;
    rawList.forEach(m => {
      if (m.totalRevenue > maxRev && m.totalRevenue > 0) {
        maxRev = m.totalRevenue;
        topRevItem = m;
      }
    });
    if (!topRevItem && rawList.length > 0) {
      topRevItem = [...rawList].sort((a, b) => b.totalRevenue - a.totalRevenue)[0];
    }

    // 2. El Más Ponderado: El más caro (mayor precio unitario / valor de lista)
    let maxPrice = -1;
    let mostExpensiveItem: TreatmentMetric | null = null;
    rawList.forEach(m => {
      if (m.unitPrice > maxPrice && m.unitPrice > 0) {
        maxPrice = m.unitPrice;
        mostExpensiveItem = m;
      }
    });
    if (!mostExpensiveItem && rawList.length > 0) {
      mostExpensiveItem = [...rawList].sort((a, b) => b.unitPrice - a.unitPrice)[0];
    }

    // 3. El Tratamiento Más Pedido: El que más turnos dimos (mayor totalAppointments)
    let maxTurns = -1;
    let mostRequestedItem: TreatmentMetric | null = null;
    rawList.forEach(m => {
      if (m.totalAppointments > maxTurns && m.totalAppointments > 0) {
        maxTurns = m.totalAppointments;
        mostRequestedItem = m;
      }
    });
    if (!mostRequestedItem && rawList.length > 0) {
      mostRequestedItem = [...rawList].sort((a, b) => b.totalAppointments - a.totalAppointments)[0];
    }

    // Mark winner flags
    rawList.forEach(m => {
      if (topRevItem && m.id === topRevItem.id && (m.totalRevenue > 0 || rawList.length === 1)) {
        m.isTopRevenue = true;
      }
      if (mostExpensiveItem && m.id === mostExpensiveItem.id && (m.unitPrice > 0 || rawList.length === 1)) {
        m.isMostExpensive = true;
      }
      if (mostRequestedItem && m.id === mostRequestedItem.id && (m.totalAppointments > 0 || rawList.length === 1)) {
        m.isMostRequested = true;
      }
    });

    return {
      metricsList: rawList,
      clinicTotalAppointments: totalClinicApps,
      clinicTotalFinished: totalClinicFinished,
      clinicTotalRevenue: totalClinicRev,
      clinicAvgPerTurnGiven: avgPerTurnGiven,
      clinicAvgPerTurnFinished: avgPerTurnFinished,
      topRevenueTreatment: topRevItem,
      mostExpensiveTreatment: mostExpensiveItem,
      mostRequestedTreatment: mostRequestedItem
    };
  }, [periodAppointments, treatments, rawEvolutions]);

  // Sorted and filtered list for table and charts
  const sortedMetrics = useMemo(() => {
    let list = [...metricsList];

    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      list = list.filter(m => m.name.toLowerCase().includes(q));
    }

    list.sort((a, b) => {
      if (sortKey === 'total_revenue') {
        // Líder en facturación: el que más facture
        if (b.totalRevenue !== a.totalRevenue) {
          return b.totalRevenue - a.totalRevenue;
        }
        return b.totalAppointments - a.totalAppointments;
      }
      if (sortKey === 'most_expensive') {
        // El más ponderado: el más caro
        if (b.unitPrice !== a.unitPrice) {
          return b.unitPrice - a.unitPrice;
        }
        return b.totalRevenue - a.totalRevenue;
      }
      if (sortKey === 'total_turns') {
        // El más pedido: el que más turnos dimos
        if (b.totalAppointments !== a.totalAppointments) {
          return b.totalAppointments - a.totalAppointments;
        }
        return b.totalRevenue - a.totalRevenue;
      }
      if (sortKey === 'revenue_per_turn_given') {
        // Facturación dividida por turnos dados
        if (b.revenuePerTurnGiven !== a.revenuePerTurnGiven) {
          return b.revenuePerTurnGiven - a.revenuePerTurnGiven;
        }
        return b.totalRevenue - a.totalRevenue;
      }
      return 0;
    });

    return list;
  }, [metricsList, sortKey, searchTerm]);

  // Chart data
  const chartData = useMemo(() => {
    const activeTreatments = sortedMetrics.filter(m => m.totalAppointments > 0 || m.totalRevenue > 0 || m.unitPrice > 0);
    const displayList = (activeTreatments.length > 0 ? activeTreatments : sortedMetrics).slice(0, 10);

    return displayList.map(m => {
      const shortName = m.name.length > 20 ? m.name.slice(0, 18) + '…' : m.name;
      return {
        name: shortName,
        fullName: m.name,
        totalRevenue: m.totalRevenue,
        totalAppointments: m.totalAppointments,
        finishedAppointments: m.finishedAppointments,
        unitPrice: m.unitPrice,
        revenuePerTurnGiven: m.revenuePerTurnGiven,
        isTopRevenue: m.isTopRevenue,
        isMostExpensive: m.isMostExpensive,
        isMostRequested: m.isMostRequested
      };
    });
  }, [sortedMetrics]);

  // Export report to CSV
  const handleExportCSV = () => {
    if (metricsList.length === 0) return;

    const headers = [
      'Tratamiento',
      'Facturacion Total ($)',
      'Turnos Dados (Agendados)',
      'Turnos Atendidos',
      'Asistencia (%)',
      'Precio Unitario / Valor ($)',
      'Facturacion por Turno Dado ($/turno)',
      'Facturacion por Turno Atendido ($/turno)',
      'Clasificacion KPI'
    ];

    const rows = sortedMetrics.map(m => {
      const escape = (val: any) => `"${String(val ?? '').replace(/"/g, '""')}"`;
      const tags = [];
      if (m.isTopRevenue) tags.push('Líder en Facturación');
      if (m.isMostExpensive) tags.push('El Más Ponderado (Más Caro)');
      if (m.isMostRequested) tags.push('El Más Pedido (Más Turnos)');

      return [
        escape(m.name),
        escape(m.totalRevenue),
        escape(m.totalAppointments),
        escape(m.finishedAppointments),
        escape(m.attendanceRate + '%'),
        escape(m.unitPrice),
        escape(m.revenuePerTurnGiven),
        escape(m.revenuePerTurnFinished),
        escape(tags.join(' | ') || 'Tratamiento Estándar')
      ].join(',');
    });

    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(','), ...rows].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `analisis_tratamientos_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="bg-white p-6 rounded-2xl border border-outline-variant shadow-sm space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-outline-variant/60 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-bold">
              <Award size={18} />
            </div>
            <h2 className="text-base sm:text-lg font-black text-on-surface tracking-tight">
              Indicadores de Tratamientos: Facturación, Valor y Demanda
            </h2>
            <span className="text-[10px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-surface-bright border border-outline-variant text-on-surface-variant">
              {timeframeLabel}
            </span>
          </div>
          <p className="text-xs text-on-surface-variant mt-1 max-w-3xl">
            Identifica el <strong>líder en facturación</strong> (el que más factura), el <strong>más ponderado</strong> (el más caro) y el <strong>más pedido</strong> (el que más turnos dimos).
          </p>
        </div>

        <div className="flex items-center gap-2 self-start lg:self-auto">
          <button
            type="button"
            onClick={() => setShowMethodologyHelp(!showMethodologyHelp)}
            className="px-3 py-1.5 rounded-lg border border-outline-variant text-xs font-bold text-on-surface-variant hover:text-on-surface hover:bg-surface transition-colors flex items-center gap-1.5 cursor-pointer"
            title="¿Cómo se definen los indicadores?"
          >
            <HelpCircle size={14} className="text-primary" />
            <span className="hidden sm:inline">Definiciones</span>
          </button>
          <button
            type="button"
            onClick={handleExportCSV}
            className="px-3 py-1.5 rounded-lg bg-surface border border-outline-variant text-xs font-bold text-on-surface hover:bg-surface-bright transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs"
            title="Exportar reporte en CSV"
          >
            <Download size={14} className="text-on-surface-variant" />
            <span>Exportar CSV</span>
          </button>
        </div>
      </div>

      {/* Methodology Helper Box */}
      {showMethodologyHelp && (
        <div className="bg-surface-bright border border-outline-variant rounded-xl p-4 text-xs text-on-surface space-y-2 animate-fadeIn">
          <div className="flex items-center justify-between font-bold text-primary">
            <span className="flex items-center gap-1.5">
              <Info size={15} />
              Criterios de Ponderación e Indicadores
            </span>
            <button
              type="button"
              onClick={() => setShowMethodologyHelp(false)}
              className="text-on-surface-variant hover:text-on-surface cursor-pointer font-bold"
            >
              ✕
            </button>
          </div>
          <p className="text-on-surface-variant leading-relaxed">
            Cada indicador responde a una pregunta estratégica clave del consultorio:
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
            <div className="bg-white p-3 rounded-xl border border-emerald-200">
              <span className="font-bold text-emerald-800 flex items-center gap-1 mb-1">
                <DollarSign size={14} /> Líder en Facturación:
              </span>
              <p className="text-on-surface-variant text-[11px]">
                Es el tratamiento que <strong>más dinero total facturó</strong> en el período seleccionado.
              </p>
            </div>
            <div className="bg-white p-3 rounded-xl border border-purple-200">
              <span className="font-bold text-purple-800 flex items-center gap-1 mb-1">
                <Gem size={14} /> El Más Ponderado:
              </span>
              <p className="text-on-surface-variant text-[11px]">
                Es el tratamiento <strong>más caro</strong> (mayor valor o precio unitario por sesión en catálogo).
              </p>
            </div>
            <div className="bg-white p-3 rounded-xl border border-sky-200">
              <span className="font-bold text-sky-800 flex items-center gap-1 mb-1">
                <Calendar size={14} /> El Más Pedido:
              </span>
              <p className="text-on-surface-variant text-[11px]">
                Es el tratamiento al que <strong>más turnos dimos</strong> (mayor cantidad de turnos asignados en agenda).
              </p>
            </div>
          </div>
        </div>
      )}

      {/* 4 Main KPI Cards: Líder en Facturación, El Más Ponderado (Más Caro), El Más Pedido (Más Turnos) y Promedio Clínica */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1: Líder en Facturación (El que más factura) */}
        <div className="p-4 rounded-xl border border-emerald-200 bg-gradient-to-br from-emerald-50/80 via-white to-emerald-100/30 shadow-xs relative overflow-hidden flex flex-col justify-between">
          <div className="absolute top-0 right-0 transform translate-x-2 -translate-y-2 opacity-15 pointer-events-none">
            <DollarSign size={85} className="text-emerald-700" />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md bg-emerald-700 text-white flex items-center gap-1 shadow-xs">
                💰 Líder en Facturación
              </span>
              {topRevenueTreatment && (
                <span className="text-[11px] font-black text-emerald-900 bg-emerald-100 border border-emerald-300 px-1.5 py-0.5 rounded">
                  {topRevenueTreatment.revenueShare}% de la clínica
                </span>
              )}
            </div>
            <h3 className="text-sm font-black text-on-surface line-clamp-1 mt-1" title={topRevenueTreatment?.name || 'Sin registros'}>
              {topRevenueTreatment?.name || 'Sin facturación registrada'}
            </h3>
            <div className="mt-2">
              <div className="text-2xl font-black text-emerald-950 tracking-tight">
                ${(topRevenueTreatment?.totalRevenue || 0).toLocaleString('es-AR')}
              </div>
              <p className="text-[11px] font-semibold text-emerald-800 mt-0.5">
                El tratamiento que más facturó
              </p>
            </div>
          </div>
          <div className="mt-3 pt-2 border-t border-emerald-200/80 text-[11px] text-emerald-950 flex items-center justify-between">
            <span className="font-semibold">{topRevenueTreatment?.finishedAppointments || 0} turnos atendidos</span>
            <span className="font-bold text-emerald-800">{topRevenueTreatment?.totalAppointments || 0} turnos dados</span>
          </div>
        </div>

        {/* KPI 2: El Más Ponderado (El más caro de la clínica) */}
        <div className="p-4 rounded-xl border border-purple-200 bg-gradient-to-br from-purple-50/80 via-white to-purple-100/30 shadow-xs relative overflow-hidden flex flex-col justify-between">
          <div className="absolute top-0 right-0 transform translate-x-2 -translate-y-2 opacity-15 pointer-events-none">
            <Gem size={85} className="text-purple-600" />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md bg-purple-700 text-white flex items-center gap-1 shadow-xs">
                💎 El Más Ponderado
              </span>
              <span className="text-[11px] font-black text-purple-900 bg-purple-100 border border-purple-300 px-1.5 py-0.5 rounded">
                El más caro
              </span>
            </div>
            <h3 className="text-sm font-black text-on-surface line-clamp-1 mt-1" title={mostExpensiveTreatment?.name || 'Sin registros'}>
              {mostExpensiveTreatment?.name || 'Sin catálogo de precios'}
            </h3>
            <div className="mt-2">
              <div className="text-2xl font-black text-purple-950 tracking-tight">
                ${(mostExpensiveTreatment?.unitPrice || 0).toLocaleString('es-AR')}
                <span className="text-xs font-semibold text-purple-800 ml-1">/ sesión</span>
              </div>
              <p className="text-[11px] font-semibold text-purple-800 mt-0.5">
                Mayor valor unitario de la clínica
              </p>
            </div>
          </div>
          <div className="mt-3 pt-2 border-t border-purple-200/80 text-[11px] text-purple-950 flex items-center justify-between">
            <span className="font-semibold">{mostExpensiveTreatment?.totalAppointments || 0} turnos dados</span>
            <span className="font-bold text-purple-800">${(mostExpensiveTreatment?.totalRevenue || 0).toLocaleString('es-AR')} total</span>
          </div>
        </div>

        {/* KPI 3: El Más Pedido (El que más turnos dimos) */}
        <div className="p-4 rounded-xl border border-sky-200 bg-gradient-to-br from-sky-50/80 via-white to-sky-100/30 shadow-xs relative overflow-hidden flex flex-col justify-between">
          <div className="absolute top-0 right-0 transform translate-x-2 -translate-y-2 opacity-15 pointer-events-none">
            <Calendar size={85} className="text-sky-600" />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md bg-sky-700 text-white flex items-center gap-1 shadow-xs">
                📅 El Más Pedido
              </span>
              {mostRequestedTreatment && (
                <span className="text-[11px] font-black text-sky-900 bg-sky-100 border border-sky-300 px-1.5 py-0.5 rounded">
                  {mostRequestedTreatment.turnShare}% agenda
                </span>
              )}
            </div>
            <h3 className="text-sm font-black text-on-surface line-clamp-1 mt-1" title={mostRequestedTreatment?.name || 'Sin registros'}>
              {mostRequestedTreatment?.name || 'Sin turnos en el período'}
            </h3>
            <div className="mt-2">
              <div className="text-2xl font-black text-sky-950 tracking-tight">
                {mostRequestedTreatment?.totalAppointments || 0}
                <span className="text-xs font-semibold text-sky-800 ml-1">turnos dados</span>
              </div>
              <p className="text-[11px] font-semibold text-sky-800 mt-0.5">
                El tratamiento al que más turnos dimos
              </p>
            </div>
          </div>
          <div className="mt-3 pt-2 border-t border-sky-200/80 text-[11px] text-sky-950 flex items-center justify-between">
            <span className="font-semibold">{mostRequestedTreatment?.finishedAppointments || 0} atendidos</span>
            <span className="font-bold text-sky-800">${(mostRequestedTreatment?.totalRevenue || 0).toLocaleString('es-AR')} facturados</span>
          </div>
        </div>

        {/* KPI 4: Promedio General de la Clínica (Referencia) */}
        <div className="p-4 rounded-xl border border-outline-variant bg-surface-bright/50 shadow-xs relative overflow-hidden flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md bg-surface border border-outline-variant text-on-surface-variant flex items-center gap-1">
                <Zap size={11} className="text-primary" />
                Promedio de la Clínica
              </span>
              <span className="text-[11px] font-bold text-on-surface-variant">
                Referencia
              </span>
            </div>
            <h3 className="text-sm font-bold text-on-surface mt-1">
              Ticket Promedio General
            </h3>
            <div className="mt-2">
              <div className="text-2xl font-black text-on-surface tracking-tight">
                ${clinicAvgPerTurnFinished.toLocaleString('es-AR')}
                <span className="text-xs font-semibold text-on-surface-variant ml-1">/ asistido</span>
              </div>
              <p className="text-[11px] font-medium text-on-surface-variant mt-0.5">
                ${clinicAvgPerTurnGiven.toLocaleString('es-AR')} por turno dado en agenda
              </p>
            </div>
          </div>
          <div className="mt-3 pt-2 border-t border-outline-variant/60 text-[11px] text-on-surface-variant flex items-center justify-between">
            <span>{clinicTotalAppointments} turnos dados</span>
            <span className="font-bold text-primary">${clinicTotalRevenue.toLocaleString('es-AR')} total</span>
          </div>
        </div>
      </div>

      {/* Interactive Controls & Visual Chart */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {/* Chart Display Mode */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-on-surface-variant uppercase tracking-wider">
              Gráfico:
            </span>
            <div className="flex bg-surface-bright rounded-lg p-0.5 border border-outline-variant">
              <button
                type="button"
                onClick={() => setChartView('comparison_bars')}
                className={cn(
                  "px-3 py-1 text-xs font-bold rounded-md transition-all cursor-pointer flex items-center gap-1.5",
                  chartView === 'comparison_bars'
                    ? "bg-white text-emerald-800 shadow-xs font-black"
                    : "text-on-surface-variant hover:text-on-surface"
                )}
              >
                <Layers size={13} />
                <span>Facturación ($) vs. Turnos Dados</span>
              </button>
              <button
                type="button"
                onClick={() => setChartView('prices_view')}
                className={cn(
                  "px-3 py-1 text-xs font-bold rounded-md transition-all cursor-pointer flex items-center gap-1.5",
                  chartView === 'prices_view'
                    ? "bg-white text-purple-900 shadow-xs font-black"
                    : "text-on-surface-variant hover:text-on-surface"
                )}
              >
                <Gem size={13} />
                <span>Precios y Ponderación ($)</span>
              </button>
              <button
                type="button"
                onClick={() => setChartView('revenue_per_turn')}
                className={cn(
                  "px-3 py-1 text-xs font-bold rounded-md transition-all cursor-pointer flex items-center gap-1.5",
                  chartView === 'revenue_per_turn'
                    ? "bg-white text-primary shadow-xs font-black"
                    : "text-on-surface-variant hover:text-on-surface"
                )}
              >
                <DollarSign size={13} />
                <span>Facturación / Turno Dado</span>
              </button>
            </div>
          </div>

          {/* Sort Key Selector */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-on-surface-variant uppercase tracking-wider">
              Ordenar por:
            </span>
            <div className="flex bg-surface-bright rounded-lg p-0.5 border border-outline-variant text-xs">
              <button
                type="button"
                onClick={() => setSortKey('total_revenue')}
                className={cn(
                  "px-2.5 py-1 font-bold rounded-md transition-all cursor-pointer",
                  sortKey === 'total_revenue' ? "bg-white text-emerald-800 shadow-xs font-black" : "text-on-surface-variant"
                )}
                title="Líder en facturación: el que más facture"
              >
                Mayor Facturación
              </button>
              <button
                type="button"
                onClick={() => setSortKey('most_expensive')}
                className={cn(
                  "px-2.5 py-1 font-bold rounded-md transition-all cursor-pointer",
                  sortKey === 'most_expensive' ? "bg-white text-purple-800 shadow-xs font-black" : "text-on-surface-variant"
                )}
                title="El más ponderado: el más caro"
              >
                Más Caro (Ponderado)
              </button>
              <button
                type="button"
                onClick={() => setSortKey('total_turns')}
                className={cn(
                  "px-2.5 py-1 font-bold rounded-md transition-all cursor-pointer",
                  sortKey === 'total_turns' ? "bg-white text-sky-800 shadow-xs font-black" : "text-on-surface-variant"
                )}
                title="El más pedido: el que más turnos dimos"
              >
                Más Turnos Dados
              </button>
              <button
                type="button"
                onClick={() => setSortKey('revenue_per_turn_given')}
                className={cn(
                  "px-2.5 py-1 font-bold rounded-md transition-all cursor-pointer",
                  sortKey === 'revenue_per_turn_given' ? "bg-white text-amber-800 shadow-xs font-black" : "text-on-surface-variant"
                )}
                title="Rendimiento: facturación por cada turno dado"
              >
                $/Turno Dado
              </button>
            </div>
          </div>
        </div>

        {/* Visual Chart Box */}
        <div className="bg-surface rounded-xl p-4 border border-outline-variant/60">
          <div className="flex items-center justify-between mb-3 text-xs">
            <div className="font-bold text-on-surface flex items-center gap-1.5">
              <BarChart2 size={15} className="text-primary" />
              {chartView === 'comparison_bars' && 'Comparativa: Facturación Total ($) vs. Cantidad de Turnos Dados'}
              {chartView === 'prices_view' && 'Precios y Valor Unitario de Tratamientos (Identifica al Más Caro)'}
              {chartView === 'revenue_per_turn' && 'Rendimiento: Facturación Generada por Cada Turno Dado ($/turno)'}
            </div>
            {chartView === 'prices_view' && clinicAvgPerTurnFinished > 0 && (
              <div className="text-[11px] font-semibold text-on-surface-variant flex items-center gap-2">
                <span className="w-3 h-0.5 bg-purple-500 inline-block border-t border-dashed border-purple-500"></span>
                <span>Ticket Promedio Clínica: ${clinicAvgPerTurnFinished.toLocaleString('es-AR')}</span>
              </div>
            )}
          </div>

          <div className="h-[280px] w-full">
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                {chartView === 'comparison_bars' ? (
                  <BarChart data={chartData} margin={{ top: 15, right: 20, left: 10, bottom: 40 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                    <XAxis 
                      dataKey="name" 
                      angle={-20} 
                      textAnchor="end" 
                      interval={0} 
                      tick={{ fontSize: 11, fill: '#475569', fontWeight: 600 }}
                    />
                    <YAxis 
                      yAxisId="left"
                      orientation="left"
                      tick={{ fontSize: 11, fill: '#0284C7' }}
                      label={{ value: 'Turnos Dados', angle: -90, position: 'insideLeft', fontSize: 10, fill: '#0284C7' }}
                    />
                    <YAxis 
                      yAxisId="right"
                      orientation="right"
                      tickFormatter={(val) => `$${(val / 1000).toFixed(0)}k`}
                      tick={{ fontSize: 11, fill: '#16A34A' }}
                      label={{ value: 'Facturación ($)', angle: 90, position: 'insideRight', fontSize: 10, fill: '#16A34A' }}
                    />
                    <Tooltip 
                      formatter={(val: any, name: string) => [
                        name === 'totalAppointments' ? `${val} turnos dados` : `$${Number(val).toLocaleString('es-AR')}`, 
                        name === 'totalAppointments' ? 'Turnos Dados (Más Pedido)' : 'Facturación Total (Líder)'
                      ]}
                      labelFormatter={(label, payload) => {
                        const it = payload?.[0]?.payload;
                        return it?.fullName || label;
                      }}
                      contentStyle={{ borderRadius: '8px', fontSize: '11px', fontWeight: 600 }}
                    />
                    <Legend 
                      wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }}
                      formatter={(val) => val === 'totalAppointments' ? 'Turnos Dados (Demanda)' : 'Facturación Total Cobrada ($)'}
                    />
                    <Bar yAxisId="left" dataKey="totalAppointments" name="totalAppointments" fill="#0284C7" radius={[4, 4, 0, 0]} />
                    <Bar yAxisId="right" dataKey="totalRevenue" name="totalRevenue" fill="#16A34A" radius={[4, 4, 0, 0]} />
                  </BarChart>
                ) : chartView === 'prices_view' ? (
                  <BarChart data={chartData} margin={{ top: 15, right: 20, left: 10, bottom: 40 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                    <XAxis 
                      dataKey="name" 
                      angle={-20} 
                      textAnchor="end" 
                      interval={0} 
                      tick={{ fontSize: 11, fill: '#475569', fontWeight: 600 }}
                    />
                    <YAxis 
                      tickFormatter={(val) => `$${(val / 1000).toFixed(0)}k`} 
                      tick={{ fontSize: 11, fill: '#7C3AED' }}
                    />
                    <Tooltip 
                      formatter={(val: any) => [`$${Number(val).toLocaleString('es-AR')}`, 'Precio / Valor de Lista']}
                      labelFormatter={(label, payload) => {
                        const it = payload?.[0]?.payload;
                        return it?.fullName ? `${it.fullName}` : label;
                      }}
                      contentStyle={{ borderRadius: '8px', fontSize: '11px', fontWeight: 600 }}
                    />
                    {clinicAvgPerTurnFinished > 0 && (
                      <ReferenceLine 
                        y={clinicAvgPerTurnFinished} 
                        stroke="#7C3AED" 
                        strokeDasharray="4 4" 
                        label={{ 
                          value: `Promedio: $${clinicAvgPerTurnFinished.toLocaleString('es-AR')}`, 
                          position: 'top', 
                          fill: '#6D28D9', 
                          fontSize: 10, 
                          fontWeight: 'bold' 
                        }} 
                      />
                    )}
                    <Bar dataKey="unitPrice" name="Precio / Valor Unitario ($)" radius={[6, 6, 0, 0]}>
                      {chartData.map((entry, index) => {
                        const isMostExp = entry.isMostExpensive;
                        return <Cell key={`cell-${index}`} fill={isMostExp ? '#7C3AED' : '#A78BFA'} />;
                      })}
                    </Bar>
                  </BarChart>
                ) : (
                  <BarChart data={chartData} margin={{ top: 15, right: 20, left: 10, bottom: 40 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                    <XAxis 
                      dataKey="name" 
                      angle={-20} 
                      textAnchor="end" 
                      interval={0} 
                      tick={{ fontSize: 11, fill: '#475569', fontWeight: 600 }}
                    />
                    <YAxis 
                      tickFormatter={(val) => `$${(val / 1000).toFixed(0)}k`} 
                      tick={{ fontSize: 11, fill: '#64748B' }}
                    />
                    <Tooltip 
                      formatter={(val: any) => [`$${Number(val).toLocaleString('es-AR')}`, 'Facturación / Turno Dado']}
                      labelFormatter={(label, payload) => {
                        const it = payload?.[0]?.payload;
                        return it?.fullName ? `${it.fullName}` : label;
                      }}
                      contentStyle={{ borderRadius: '8px', fontSize: '11px', fontWeight: 600 }}
                    />
                    {clinicAvgPerTurnGiven > 0 && (
                      <ReferenceLine 
                        y={clinicAvgPerTurnGiven} 
                        stroke="#EF4444" 
                        strokeDasharray="4 4" 
                        label={{ 
                          value: `Media: $${clinicAvgPerTurnGiven.toLocaleString('es-AR')}`, 
                          position: 'top', 
                          fill: '#DC2626', 
                          fontSize: 10, 
                          fontWeight: 'bold' 
                        }} 
                      />
                    )}
                    <Bar dataKey="revenuePerTurnGiven" name="Facturación / Turno Dado ($)" radius={[6, 6, 0, 0]}>
                      {chartData.map((entry, index) => {
                        const isTop = entry.isTopRevenue;
                        return <Cell key={`cell-${index}`} fill={isTop ? '#10B981' : '#0284C7'} />;
                      })}
                    </Bar>
                  </BarChart>
                )}
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-xs text-on-surface-variant font-medium">
                Sin datos suficientes para graficar en este período.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Comprehensive Treatments Table */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h4 className="text-xs font-black uppercase tracking-wider text-on-surface flex items-center gap-2">
              <Award size={14} className="text-primary" />
              Tabla de Tratamientos ({metricsList.length} prácticas registradas)
            </h4>
            <p className="text-[11px] text-on-surface-variant">
              Compara de forma directa el dinero facturado, el valor de cada práctica y los turnos dados.
            </p>
          </div>

          {/* Search treatment filter */}
          <div className="relative w-full sm:w-64">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" />
            <input
              type="text"
              placeholder="Buscar tratamiento..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 bg-surface border border-outline-variant rounded-lg text-xs outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
        </div>

        <div className="overflow-x-auto border border-outline-variant rounded-xl">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-outline-variant text-[10px] font-black uppercase tracking-wider text-on-surface-variant bg-surface-bright">
                <th className="py-3 px-4">Tratamiento</th>
                <th className="py-3 px-4 text-right bg-emerald-50/60 text-emerald-950 font-black">
                  Facturación Total (Líder)
                </th>
                <th className="py-3 px-4 text-right bg-purple-50/60 text-purple-950 font-black">
                  Precio / Valor (El Más Caro)
                </th>
                <th className="py-3 px-4 text-center bg-sky-50/60 text-sky-950 font-black">
                  Turnos Dados (El Más Pedido)
                </th>
                <th className="py-3 px-3 text-center">Atendidos</th>
                <th className="py-3 px-4 text-right">Facturación / Turno Dado</th>
                <th className="py-3 px-4 text-center">Clasificación</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/40">
              {sortedMetrics.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-xs text-on-surface-variant font-medium">
                    No se encontraron tratamientos que coincidan con la búsqueda.
                  </td>
                </tr>
              ) : (
                sortedMetrics.map((m) => {
                  return (
                    <tr 
                      key={m.id} 
                      className={cn(
                        "hover:bg-surface/60 transition-colors",
                        m.isTopRevenue ? "bg-emerald-50/20 font-semibold" : ""
                      )}
                    >
                      {/* Name & Badges */}
                      <td className="py-3 px-4">
                        <div className="flex flex-col">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-bold text-on-surface text-xs">
                              {m.name}
                            </span>
                            {m.isTopRevenue && (
                              <span className="px-1.5 py-0.2 rounded text-[9px] font-black bg-emerald-100 text-emerald-900 border border-emerald-300">
                                💰 Líder Facturación
                              </span>
                            )}
                            {m.isMostExpensive && (
                              <span className="px-1.5 py-0.2 rounded text-[9px] font-black bg-purple-100 text-purple-900 border border-purple-300">
                                💎 El Más Caro
                              </span>
                            )}
                            {m.isMostRequested && (
                              <span className="px-1.5 py-0.2 rounded text-[9px] font-black bg-sky-100 text-sky-900 border border-sky-300">
                                📅 El Más Pedido
                              </span>
                            )}
                          </div>
                          <span className="text-[10px] text-on-surface-variant font-medium">
                            {m.catalogDuration} min duración
                          </span>
                        </div>
                      </td>

                      {/* Facturación Total (Líder en facturación) */}
                      <td className="py-3 px-4 text-right bg-emerald-50/30">
                        <span className={cn(
                          "font-black text-xs",
                          m.isTopRevenue ? "text-emerald-950 text-sm" : "text-emerald-800"
                        )}>
                          ${m.totalRevenue.toLocaleString('es-AR')}
                        </span>
                        <div className="text-[10px] text-emerald-700 font-semibold">
                          {m.revenueShare}% de la clínica
                        </div>
                      </td>

                      {/* Precio / Valor (El más ponderado / más caro) */}
                      <td className="py-3 px-4 text-right bg-purple-50/30">
                        <span className={cn(
                          "font-black text-xs",
                          m.isMostExpensive ? "text-purple-950 text-sm" : "text-purple-800"
                        )}>
                          ${m.unitPrice.toLocaleString('es-AR')}
                        </span>
                        <div className="text-[10px] text-purple-700 font-semibold">
                          por sesión
                        </div>
                      </td>

                      {/* Turnos Dados (El más pedido) */}
                      <td className="py-3 px-4 text-center bg-sky-50/30">
                        <div className="flex flex-col items-center">
                          <span className={cn(
                            "font-black text-xs",
                            m.isMostRequested ? "text-sky-950 text-sm" : "text-sky-800"
                          )}>
                            {m.totalAppointments} turnos
                          </span>
                          <span className="text-[10px] text-sky-700 font-semibold">
                            {m.turnShare}% agenda
                          </span>
                        </div>
                      </td>

                      {/* Atendidos y Asistencia */}
                      <td className="py-3 px-3 text-center">
                        <div className="flex flex-col items-center">
                          <span className="font-semibold text-on-surface text-xs">{m.finishedAppointments}</span>
                          {m.totalAppointments > 0 && (
                            <span className="text-[10px] text-on-surface-variant font-medium">
                              {m.attendanceRate}% asist.
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Facturación / Turno Dado */}
                      <td className="py-3 px-4 text-right">
                        <span className="font-bold text-on-surface text-xs">
                          ${m.revenuePerTurnGiven.toLocaleString('es-AR')}
                        </span>
                        <div className="text-[10px] text-on-surface-variant font-medium">
                          por turno dado
                        </div>
                      </td>

                      {/* Clasificación Badge */}
                      <td className="py-3 px-4 text-center">
                        <div className="flex items-center justify-center gap-1 flex-wrap">
                          {m.isTopRevenue && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-800">
                              Líder $
                            </span>
                          )}
                          {m.isMostExpensive && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-purple-100 text-purple-800">
                              Más Caro
                            </span>
                          )}
                          {m.isMostRequested && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-sky-100 text-sky-800">
                              Más Pedido
                            </span>
                          )}
                          {!m.isTopRevenue && !m.isMostExpensive && !m.isMostRequested && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-surface-bright text-on-surface-variant border border-outline-variant">
                              Estándar
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
