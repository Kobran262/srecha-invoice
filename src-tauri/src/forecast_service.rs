use crate::database::Database;
use chrono::{Datelike, NaiveDate};
use rusqlite::Row;
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, HashMap};

#[derive(Debug, Clone, Deserialize)]
pub struct ForecastRequest {
    /// inclusive, формат YYYY-MM-DD; если null — все доступные данные
    pub start_date: Option<String>,
    /// inclusive, формат YYYY-MM-DD; если null — все доступные данные
    pub end_date: Option<String>,

    /// опционально: фильтр по категориям (products.category)
    pub categories: Option<Vec<String>>,

    /// Горизонты прогноза (месяцев) — UI будет фиксированный 3/6/12, но backend держим универсальным
    pub horizons: Option<Vec<u32>>,

    /// Режим прогноза
    pub mode: ForecastMode,

    /// Рост для горизонтов (в процентах, например 15 = +15%).
    /// Используется в режимах Preset/Manual.
    pub growth_pct_3: Option<f64>,
    pub growth_pct_6: Option<f64>,
    pub growth_pct_12: Option<f64>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ForecastMode {
    NoGrowth,
    PresetPct,
    AutoTrend,
    ManualPct,
}

#[derive(Debug, Clone, Serialize)]
pub struct ForecastReport {
    pub meta: ReportMeta,
    pub kpi: KpiSummary,

    pub monthly_totals: Vec<MonthlyPoint>,
    pub top10_weight_series: Top10Series,

    pub forecast_cards: Vec<ForecastCard>,
    pub sku_table: Vec<SkuForecastRow>,
    pub family_table: Vec<FamilyForecastRow>,
}

#[derive(Debug, Clone, Serialize)]
pub struct ReportMeta {
    pub start_month: String, // YYYY-MM
    pub end_month: String,   // YYYY-MM
    pub months_count: u32,
    pub horizons: Vec<u32>,
    pub mode: String,

    pub effective_growth_weight: HashMap<u32, f64>,
    pub effective_growth_revenue: HashMap<u32, f64>,
    pub trend_r2_weight: Option<f64>,
    pub trend_r2_revenue: Option<f64>,
    pub trend_warning: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct KpiSummary {
    pub total_weight_kg: f64,
    pub avg_weight_kg_per_month: f64,
    pub total_units: f64,
    pub avg_units_per_month: f64,
    pub total_revenue_rsd: f64,
    pub avg_revenue_per_month: f64,
    pub unique_sku: u32,
    pub stable_sku: u32,
}

#[derive(Debug, Clone, Serialize)]
pub struct MonthlyPoint {
    pub month: String, // YYYY-MM
    pub weight_kg: f64,
    pub units: f64,
    pub revenue_rsd: f64,
    pub kind: String, // "actual" | "forecast"
}

#[derive(Debug, Clone, Serialize)]
pub struct Top10Series {
    pub months: Vec<String>,
    pub series: Vec<TopSkuSeries>,
    pub table_rows: Vec<TopSkuTableRow>,
}

#[derive(Debug, Clone, Serialize)]
pub struct TopSkuSeries {
    pub sku_code: String,
    pub product_name: String,
    pub category: Option<String>,
    pub points_kg: Vec<f64>, // aligned with months
}

#[derive(Debug, Clone, Serialize)]
pub struct TopSkuTableRow {
    pub sku_code: String,
    pub product_name: String,
    pub category: Option<String>,
    pub month_kg: Vec<f64>,
    pub total_kg: f64,
    pub stability: f64,
}

#[derive(Debug, Clone, Serialize)]
pub struct ForecastCard {
    pub horizon_months: u32,
    pub weight_kg: f64,
    pub units: f64,
    pub revenue_rsd: f64,
    pub growth_applied: f64,
    pub r2_weight: Option<f64>,
    pub r2_revenue: Option<f64>,
}

#[derive(Debug, Clone, Serialize)]
pub struct SkuForecastRow {
    pub sku_code: String,
    pub product_name: String,
    pub category: Option<String>,
    pub unit_weight_g: Option<f64>,

    pub sum_units: f64,
    pub sum_weight_kg: f64,
    pub sum_revenue_rsd: f64,
    pub stability: f64,
    pub avg_weight_kg_per_month: f64,

    pub forecast_weight_kg: HashMap<u32, f64>,
    pub forecast_units: HashMap<u32, f64>,
    pub forecast_revenue_rsd: HashMap<u32, f64>,

    pub unreliable: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct FamilyForecastRow {
    pub family_name: String,
    pub category: Option<String>,
    pub sku_count: u32,
    pub pack_sizes_g: Vec<u32>,

    pub sum_units: f64,
    pub sum_weight_kg: f64,
    pub sum_revenue_rsd: f64,

    pub forecast_weight_kg: HashMap<u32, f64>,
    pub forecast_units: HashMap<u32, f64>,
    pub forecast_revenue_rsd: HashMap<u32, f64>,
}

#[derive(Debug, Clone)]
struct Txn {
    date: NaiveDate,
    sku_code: String,
    product_name: String,
    category: Option<String>,
    quantity: f64,
    unit_weight_g: Option<f64>,
    total_amount_rsd: f64,
}

pub struct ForecastService;

impl ForecastService {
    pub fn generate(db: &Database, req: ForecastRequest) -> Result<ForecastReport, String> {
        let txns = load_transactions(db, &req)?;
        if txns.is_empty() {
            return Err("Нет данных продаж за выбранный период".to_string());
        }

        let horizons = req.horizons.clone().unwrap_or_else(|| vec![3, 6, 12]);
        let (start_month, end_month, months) = month_range_from_txns(&txns);

        // Aggregations
        let (monthly_totals_actual, sku_monthly) = aggregate_monthly(&txns, &months);

        let months_count = months.len() as f64;
        let total_weight_kg: f64 = monthly_totals_actual.values().map(|m| m.weight_kg).sum();
        let total_units: f64 = monthly_totals_actual.values().map(|m| m.units).sum();
        let total_revenue_rsd: f64 = monthly_totals_actual.values().map(|m| m.revenue_rsd).sum();

        let unique_sku = sku_monthly.len() as u32;
        let stable_sku = sku_monthly
            .values()
            .filter(|s| stability(&s.months_kg) >= 0.5)
            .count() as u32;

        let kpi = KpiSummary {
            total_weight_kg,
            avg_weight_kg_per_month: total_weight_kg / months_count,
            total_units,
            avg_units_per_month: total_units / months_count,
            total_revenue_rsd,
            avg_revenue_per_month: total_revenue_rsd / months_count,
            unique_sku,
            stable_sku,
        };

        // Trend model (auto)
        let (trend_w, trend_u, trend_r) = if matches!(req.mode, ForecastMode::AutoTrend) {
            let series_w: Vec<f64> = months
                .iter()
                .map(|m| monthly_totals_actual.get(m).map(|x| x.weight_kg).unwrap_or(0.0))
                .collect();
            let series_u: Vec<f64> = months
                .iter()
                .map(|m| monthly_totals_actual.get(m).map(|x| x.units).unwrap_or(0.0))
                .collect();
            let series_r: Vec<f64> = months
                .iter()
                .map(|m| monthly_totals_actual.get(m).map(|x| x.revenue_rsd).unwrap_or(0.0))
                .collect();
            (
                Some(trend_regression(&series_w)),
                Some(trend_regression(&series_u)),
                Some(trend_regression(&series_r)),
            )
        } else {
            (None, None, None)
        };

        let mut effective_growth_weight: HashMap<u32, f64> = HashMap::new();
        let mut effective_growth_revenue: HashMap<u32, f64> = HashMap::new();

        // Forecast cards (overall)
        let avg_w = kpi.avg_weight_kg_per_month;
        let avg_u = kpi.avg_units_per_month;
        let avg_r = kpi.avg_revenue_per_month;

        let mut cards: Vec<ForecastCard> = Vec::new();
        for &h in &horizons {
            let (growth_w, r2_w, warn_w) = resolve_growth_from_req(&req, h, avg_w, trend_w.as_ref());
            let (growth_r, r2_r, warn_r) = resolve_growth_from_req(&req, h, avg_r, trend_r.as_ref());
            let growth = if matches!(req.mode, ForecastMode::AutoTrend) {
                // В авто режиме допускаем разные коэффициенты, но UI хочет “показать какой рост увидела модель”
                // Для карточки показываем весовой как основной.
                growth_w
            } else {
                growth_w
            };

            effective_growth_weight.insert(h, growth_w);
            effective_growth_revenue.insert(h, growth_r);

            let warning = warn_w.or(warn_r);
            let _ = warning; // warning отображаем в meta, не в карточке

            cards.push(ForecastCard {
                horizon_months: h,
                weight_kg: avg_w * (h as f64) * (1.0 + growth_w),
                units: avg_u * (h as f64) * (1.0 + growth),
                revenue_rsd: avg_r * (h as f64) * (1.0 + growth_r),
                growth_applied: growth,
                r2_weight: r2_w,
                r2_revenue: r2_r,
            });
        }

        // Build monthly totals with forecast tail (overall)
        let mut monthly_points: Vec<MonthlyPoint> = months
            .iter()
            .map(|m| {
                let x = monthly_totals_actual.get(m).cloned().unwrap_or_default();
                MonthlyPoint {
                    month: m.clone(),
                    weight_kg: x.weight_kg,
                    units: x.units,
                    revenue_rsd: x.revenue_rsd,
                    kind: "actual".to_string(),
                }
            })
            .collect();

        // forecast series for chart: use longest horizon
        let max_h = *horizons.iter().max().unwrap_or(&12);
        let future_months = next_months(&end_month, max_h as usize);
        if matches!(req.mode, ForecastMode::AutoTrend) {
            if let Some(model) = trend_w.as_ref() {
                // build forecast month-by-month via regression, but clamp at 0
                let base_len = series_len_for_trend(months.len());
                for (i, fm) in future_months.iter().enumerate() {
                    let t = (base_len as f64) + (i as f64);
                    let fw = (model.a * t + model.b).max(0.0);
                    let fu = if let Some(mu) = trend_u.as_ref() {
                        (mu.a * t + mu.b).max(0.0)
                    } else {
                        0.0
                    };
                    let fr = if let Some(mr) = trend_r.as_ref() {
                        (mr.a * t + mr.b).max(0.0)
                    } else {
                        0.0
                    };
                    monthly_points.push(MonthlyPoint {
                        month: fm.clone(),
                        weight_kg: fw,
                        units: fu,
                        revenue_rsd: fr,
                        kind: "forecast".to_string(),
                    });
                }
            }
        } else {
            let growth_w = *effective_growth_weight.get(&max_h).unwrap_or(&0.0);
            let growth_r = *effective_growth_revenue.get(&max_h).unwrap_or(&0.0);
            let monthly_w = avg_w * (1.0 + growth_w);
            let monthly_u = avg_u * (1.0 + growth_w);
            let monthly_r = avg_r * (1.0 + growth_r);
            for fm in &future_months {
                monthly_points.push(MonthlyPoint {
                    month: fm.clone(),
                    weight_kg: monthly_w,
                    units: monthly_u,
                    revenue_rsd: monthly_r,
                    kind: "forecast".to_string(),
                });
            }
        }

        // Top-10 stable SKUs by weight
        let top10 = top10_series(&sku_monthly, &months);

        // SKU table forecast: per-SKU avg and apply growth
        let sku_table = sku_table_forecast(
            &sku_monthly,
            &months,
            &horizons,
            &req,
            &effective_growth_weight,
            &effective_growth_revenue,
        );
        let family_table = family_table_forecast(&sku_table, &horizons);

        let mut trend_warning: Option<String> = None;
        if matches!(req.mode, ForecastMode::AutoTrend) {
            if months.len() < 6 {
                trend_warning = Some("Недостаточно истории для авто-прогноза (нужно >= 6 месяцев)".to_string());
            } else if let Some(m) = &trend_w {
                if m.r2 < 0.3 {
                    trend_warning = Some("⚠️ Тренд по весу слабо выражен (R² < 0.3). Прогноз может быть ненадёжен.".to_string());
                }
            }
        }

        Ok(ForecastReport {
            meta: ReportMeta {
                start_month,
                end_month,
                months_count: months.len() as u32,
                horizons: horizons.clone(),
                mode: mode_to_string(&req.mode),
                effective_growth_weight,
                effective_growth_revenue,
                trend_r2_weight: trend_w.as_ref().map(|m| m.r2),
                trend_r2_revenue: trend_r.as_ref().map(|m| m.r2),
                trend_warning,
            },
            kpi,
            monthly_totals: monthly_points,
            top10_weight_series: top10,
            forecast_cards: cards,
            sku_table,
            family_table,
        })
    }
}

#[derive(Debug, Clone, Default)]
struct MonthAgg {
    weight_kg: f64,
    units: f64,
    revenue_rsd: f64,
}

#[derive(Debug, Clone)]
struct SkuAgg {
    sku_code: String,
    product_name: String,
    category: Option<String>,
    unit_weight_g: Option<f64>,
    months_kg: Vec<f64>,
    months_units: Vec<f64>,
    months_revenue: Vec<f64>,
}

fn mode_to_string(m: &ForecastMode) -> String {
    match m {
        ForecastMode::NoGrowth => "no_growth".to_string(),
        ForecastMode::PresetPct => "preset_pct".to_string(),
        ForecastMode::AutoTrend => "auto_trend".to_string(),
        ForecastMode::ManualPct => "manual_pct".to_string(),
    }
}

fn parse_date_ymd(s: &str) -> Option<NaiveDate> {
    NaiveDate::parse_from_str(s, "%Y-%m-%d").ok()
}

fn parse_invoice_date(s: &str) -> Option<NaiveDate> {
    // invoices.date часто ISO, но может быть YYYY-MM-DD
    if let Ok(d) = NaiveDate::parse_from_str(s, "%Y-%m-%d") {
        return Some(d);
    }
    // ISO 8601
    chrono::DateTime::parse_from_rfc3339(s).ok().map(|dt| dt.date_naive())
}

fn ym(d: NaiveDate) -> String {
    format!("{:04}-{:02}", d.year(), d.month())
}

fn month_range_from_txns(txns: &[Txn]) -> (String, String, Vec<String>) {
    let mut min_d = txns[0].date;
    let mut max_d = txns[0].date;
    for t in txns {
        if t.date < min_d {
            min_d = t.date;
        }
        if t.date > max_d {
            max_d = t.date;
        }
    }
    let start = NaiveDate::from_ymd_opt(min_d.year(), min_d.month(), 1).unwrap();
    let end = NaiveDate::from_ymd_opt(max_d.year(), max_d.month(), 1).unwrap();
    let mut months: Vec<String> = Vec::new();
    let mut cur = start;
    loop {
        months.push(ym(cur));
        if cur.year() == end.year() && cur.month() == end.month() {
            break;
        }
        cur = add_months(cur, 1);
    }
    (ym(start), ym(end), months)
}

fn add_months(d: NaiveDate, n: i32) -> NaiveDate {
    let mut y = d.year();
    let mut m = d.month() as i32 + n;
    while m > 12 {
        y += 1;
        m -= 12;
    }
    while m < 1 {
        y -= 1;
        m += 12;
    }
    NaiveDate::from_ymd_opt(y, m as u32, 1).unwrap()
}

fn next_months(end_month: &str, n: usize) -> Vec<String> {
    let parts: Vec<&str> = end_month.split('-').collect();
    let y: i32 = parts[0].parse().unwrap_or(1970);
    let m: u32 = parts.get(1).and_then(|x| x.parse().ok()).unwrap_or(1);
    let mut cur = NaiveDate::from_ymd_opt(y, m, 1).unwrap();
    let mut out = Vec::new();
    for _ in 0..n {
        cur = add_months(cur, 1);
        out.push(ym(cur));
    }
    out
}

fn load_transactions(db: &Database, req: &ForecastRequest) -> Result<Vec<Txn>, String> {
    // NOTE: пока канал b2b/b2c не храним; req.categories поддерживаем.
    let mut sql = String::from(
        "SELECT i.date, it.product_id, it.product_name, p.category, it.quantity, \
                COALESCE(it.unit_weight_g, p.weight) AS unit_weight_g, it.total \
         FROM invoices i \
         JOIN invoice_items it ON it.invoice_id = i.id \
         LEFT JOIN products p ON p.internal_code = it.product_id OR p.code = it.product_id \
         WHERE 1=1",
    );
    let mut params_vec: Vec<String> = Vec::new();

    if let Some(sd) = &req.start_date {
        if parse_date_ymd(sd).is_some() {
            sql.push_str(" AND substr(i.date,1,10) >= ? ");
            params_vec.push(sd.clone());
        }
    }
    if let Some(ed) = &req.end_date {
        if parse_date_ymd(ed).is_some() {
            sql.push_str(" AND substr(i.date,1,10) <= ? ");
            params_vec.push(ed.clone());
        }
    }
    if let Some(cats) = &req.categories {
        if !cats.is_empty() {
            // p.category IN (?, ?, ...)
            let placeholders = (0..cats.len()).map(|_| "?").collect::<Vec<_>>().join(",");
            sql.push_str(&format!(" AND p.category IN ({}) ", placeholders));
            for c in cats {
                params_vec.push(c.clone());
            }
        }
    }

    let mut stmt = db.conn().prepare(&sql).map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(rusqlite::params_from_iter(params_vec.iter()), |row| txn_from_row(row))
        .map_err(|e| e.to_string())?;

    let mut out: Vec<Txn> = Vec::new();
    for r in rows {
        if let Ok(txn) = r {
            out.push(txn);
        }
    }
    Ok(out)
}

fn txn_from_row(row: &Row<'_>) -> rusqlite::Result<Txn> {
    let date_raw: String = row.get(0)?;
    let sku_code: String = row.get(1)?;
    let product_name: String = row.get(2)?;
    let category: Option<String> = row.get(3)?;
    let quantity: f64 = row.get(4)?;
    let unit_weight_g: Option<f64> = row.get(5)?;
    let total_amount_rsd: f64 = row.get(6)?;

    let date = parse_invoice_date(&date_raw).unwrap_or_else(|| NaiveDate::from_ymd_opt(1970, 1, 1).unwrap());
    Ok(Txn {
        date,
        sku_code,
        product_name,
        category,
        quantity,
        unit_weight_g,
        total_amount_rsd,
    })
}

fn aggregate_monthly(txns: &[Txn], months: &[String]) -> (BTreeMap<String, MonthAgg>, HashMap<String, SkuAgg>) {
    let month_index: HashMap<&String, usize> = months.iter().enumerate().map(|(i, m)| (m, i)).collect();
    let mut totals: BTreeMap<String, MonthAgg> = BTreeMap::new();
    let mut sku_map: HashMap<String, SkuAgg> = HashMap::new();

    for m in months {
        totals.insert(m.clone(), MonthAgg::default());
    }

    for t in txns {
        let m = ym(NaiveDate::from_ymd_opt(t.date.year(), t.date.month(), 1).unwrap());
        if !totals.contains_key(&m) {
            continue;
        }
        let w_kg = (t.quantity * t.unit_weight_g.unwrap_or(0.0)) / 1000.0;
        {
            let agg = totals.get_mut(&m).unwrap();
            agg.weight_kg += w_kg;
            agg.units += t.quantity;
            agg.revenue_rsd += t.total_amount_rsd;
        }

        let entry = sku_map.entry(t.sku_code.clone()).or_insert_with(|| SkuAgg {
            sku_code: t.sku_code.clone(),
            product_name: t.product_name.clone(),
            category: t.category.clone(),
            unit_weight_g: t.unit_weight_g,
            months_kg: vec![0.0; months.len()],
            months_units: vec![0.0; months.len()],
            months_revenue: vec![0.0; months.len()],
        });
        let idx = *month_index.get(&m).unwrap();
        entry.months_kg[idx] += w_kg;
        entry.months_units[idx] += t.quantity;
        entry.months_revenue[idx] += t.total_amount_rsd;
        if entry.unit_weight_g.is_none() {
            entry.unit_weight_g = t.unit_weight_g;
        }
        if entry.category.is_none() {
            entry.category = t.category.clone();
        }
    }

    (totals, sku_map)
}

fn stability(months_kg: &[f64]) -> f64 {
    if months_kg.is_empty() {
        return 0.0;
    }
    let sold_months = months_kg.iter().filter(|v| **v > 0.0).count() as f64;
    sold_months / (months_kg.len() as f64)
}

#[derive(Debug, Clone)]
struct TrendModel {
    n_used: usize,
    a: f64,
    b: f64,
    r2: f64,
}

fn series_len_for_trend(total_months: usize) -> usize {
    total_months.min(12)
}

fn trend_regression(series: &[f64]) -> TrendModel {
    // use last <=12 months, include zeros
    let n = series_len_for_trend(series.len());
    let slice = &series[series.len().saturating_sub(n)..];
    let n_f = slice.len() as f64;
    let xs: Vec<f64> = (0..slice.len()).map(|i| i as f64).collect();
    let ys: Vec<f64> = slice.to_vec();

    let x_mean = xs.iter().sum::<f64>() / n_f;
    let y_mean = ys.iter().sum::<f64>() / n_f;
    let mut num = 0.0;
    let mut den = 0.0;
    for (x, y) in xs.iter().zip(ys.iter()) {
        num += (x - x_mean) * (y - y_mean);
        den += (x - x_mean) * (x - x_mean);
    }
    let a = if den.abs() < 1e-12 { 0.0 } else { num / den };
    let b = y_mean - a * x_mean;

    // R2
    let mut ss_tot = 0.0;
    let mut ss_res = 0.0;
    for (x, y) in xs.iter().zip(ys.iter()) {
        let y_hat = a * x + b;
        ss_tot += (y - y_mean) * (y - y_mean);
        ss_res += (y - y_hat) * (y - y_hat);
    }
    let r2 = if ss_tot.abs() < 1e-12 { 0.0 } else { 1.0 - (ss_res / ss_tot) };

    TrendModel { n_used: slice.len(), a, b, r2 }
}

fn resolve_growth(mode: ForecastMode, horizon: u32, mean: f64, trend: Option<&TrendModel>) -> (f64, Option<f64>, Option<String>) {
    match mode {
        ForecastMode::NoGrowth => (0.0, None, None),
        ForecastMode::PresetPct | ForecastMode::ManualPct => (0.0, None, None), // overridden by resolve_growth_from_req
        ForecastMode::AutoTrend => {
            if mean <= 0.0 {
                return (0.0, trend.map(|t| t.r2), None);
            }
            if let Some(t) = trend {
                // compute effective growth via summed regression forecast
                let n = horizon as usize;
                let base_len = t.n_used; // future starts right after regression window
                let mut total = 0.0;
                for i in 0..n {
                    let tt = (base_len as f64) + (i as f64);
                    total += (t.a * tt + t.b).max(0.0);
                }
                let eff = (total / (mean * horizon as f64)) - 1.0;
                (eff, Some(t.r2), None)
            } else {
                (0.0, None, Some("Недостаточно данных для авто-тренда".to_string()))
            }
        }
    }
}

fn resolve_growth_from_req(req: &ForecastRequest, horizon: u32, mean: f64, trend: Option<&TrendModel>) -> (f64, Option<f64>, Option<String>) {
    match req.mode {
        ForecastMode::PresetPct | ForecastMode::ManualPct => {
            // В UI проценты задаются на 3/6/12. Если не переданы — используем дефолты.
            let pct = match horizon {
                3 => req.growth_pct_3.unwrap_or(15.0),
                6 => req.growth_pct_6.unwrap_or(25.0),
                12 => req.growth_pct_12.unwrap_or(35.0),
                _ => 0.0,
            };
            (pct / 100.0, None, None)
        }
        _ => resolve_growth(req.mode.clone(), horizon, mean, trend),
    }
}

fn top10_series(sku_monthly: &HashMap<String, SkuAgg>, months: &[String]) -> Top10Series {
    let mut candidates: Vec<&SkuAgg> = sku_monthly
        .values()
        .filter(|s| stability(&s.months_kg) >= 0.5)
        .collect();
    candidates.sort_by(|a, b| {
        let ta = a.months_kg.iter().sum::<f64>();
        let tb = b.months_kg.iter().sum::<f64>();
        tb.partial_cmp(&ta).unwrap_or(std::cmp::Ordering::Equal)
    });
    candidates.truncate(10);

    let series = candidates
        .iter()
        .map(|s| TopSkuSeries {
            sku_code: s.sku_code.clone(),
            product_name: s.product_name.clone(),
            category: s.category.clone(),
            points_kg: s.months_kg.clone(),
        })
        .collect::<Vec<_>>();

    let table_rows = candidates
        .iter()
        .map(|s| TopSkuTableRow {
            sku_code: s.sku_code.clone(),
            product_name: s.product_name.clone(),
            category: s.category.clone(),
            month_kg: s.months_kg.clone(),
            total_kg: s.months_kg.iter().sum(),
            stability: stability(&s.months_kg),
        })
        .collect::<Vec<_>>();

    Top10Series {
        months: months.to_vec(),
        series,
        table_rows,
    }
}

fn sku_table_forecast(
    sku_monthly: &HashMap<String, SkuAgg>,
    months: &[String],
    horizons: &[u32],
    req: &ForecastRequest,
    overall_growth_weight: &HashMap<u32, f64>,
    overall_growth_revenue: &HashMap<u32, f64>,
) -> Vec<SkuForecastRow> {
    let m = months.len() as f64;
    let mut rows: Vec<SkuForecastRow> = Vec::new();
    for s in sku_monthly.values() {
        let sum_units: f64 = s.months_units.iter().sum();
        let sum_weight_kg: f64 = s.months_kg.iter().sum();
        let sum_revenue: f64 = s.months_revenue.iter().sum();
        let stab = stability(&s.months_kg);
        let avg_weight_kg_per_month = sum_weight_kg / m;
        let avg_units_per_month = sum_units / m;
        let avg_revenue_per_month = sum_revenue / m;
        let unreliable = stab < 0.25;

        let mut fw: HashMap<u32, f64> = HashMap::new();
        let mut fu: HashMap<u32, f64> = HashMap::new();
        let mut fr: HashMap<u32, f64> = HashMap::new();
        for &h in horizons {
            // В auto_trend режиме применяем общий коэффициент тренда (по всей истории),
            // чтобы не строить отдельные регрессии на каждый SKU.
            let gw = if matches!(req.mode, ForecastMode::AutoTrend) {
                *overall_growth_weight.get(&h).unwrap_or(&0.0)
            } else {
                resolve_growth_from_req(req, h, avg_weight_kg_per_month, None).0
            };
            let gr = if matches!(req.mode, ForecastMode::AutoTrend) {
                *overall_growth_revenue.get(&h).unwrap_or(&0.0)
            } else {
                resolve_growth_from_req(req, h, avg_revenue_per_month, None).0
            };
            fw.insert(h, avg_weight_kg_per_month * (h as f64) * (1.0 + gw));
            fu.insert(h, avg_units_per_month * (h as f64) * (1.0 + gw));
            fr.insert(h, avg_revenue_per_month * (h as f64) * (1.0 + gr));
        }

        rows.push(SkuForecastRow {
            sku_code: s.sku_code.clone(),
            product_name: s.product_name.clone(),
            category: s.category.clone(),
            unit_weight_g: s.unit_weight_g,
            sum_units,
            sum_weight_kg,
            sum_revenue_rsd: sum_revenue,
            stability: stab,
            avg_weight_kg_per_month,
            forecast_weight_kg: fw,
            forecast_units: fu,
            forecast_revenue_rsd: fr,
            unreliable,
        });
    }

    rows.sort_by(|a, b| b.avg_weight_kg_per_month.partial_cmp(&a.avg_weight_kg_per_month).unwrap_or(std::cmp::Ordering::Equal));
    rows
}

fn family_table_forecast(sku_rows: &[SkuForecastRow], horizons: &[u32]) -> Vec<FamilyForecastRow> {
    let mut map: HashMap<String, Vec<&SkuForecastRow>> = HashMap::new();
    for r in sku_rows {
        let family = r
            .product_name
            .split('/')
            .next()
            .unwrap_or(&r.product_name)
            .trim()
            .to_string();
        map.entry(family).or_default().push(r);
    }

    let mut out: Vec<FamilyForecastRow> = Vec::new();
    for (family_name, group) in map {
        let category = group.iter().find_map(|r| r.category.clone());
        let mut pack_sizes: Vec<u32> = group
            .iter()
            .filter_map(|r| r.unit_weight_g.map(|g| g.round() as u32))
            .collect();
        pack_sizes.sort();
        pack_sizes.dedup();

        let sum_units: f64 = group.iter().map(|r| r.sum_units).sum();
        let sum_weight_kg: f64 = group.iter().map(|r| r.sum_weight_kg).sum();
        let sum_revenue_rsd: f64 = group.iter().map(|r| r.sum_revenue_rsd).sum();

        let mut fw: HashMap<u32, f64> = HashMap::new();
        let mut fu: HashMap<u32, f64> = HashMap::new();
        let mut fr: HashMap<u32, f64> = HashMap::new();
        for &h in horizons {
            fw.insert(h, group.iter().map(|r| r.forecast_weight_kg.get(&h).cloned().unwrap_or(0.0)).sum());
            fu.insert(h, group.iter().map(|r| r.forecast_units.get(&h).cloned().unwrap_or(0.0)).sum());
            fr.insert(h, group.iter().map(|r| r.forecast_revenue_rsd.get(&h).cloned().unwrap_or(0.0)).sum());
        }

        out.push(FamilyForecastRow {
            family_name,
            category,
            sku_count: group.len() as u32,
            pack_sizes_g: pack_sizes,
            sum_units,
            sum_weight_kg,
            sum_revenue_rsd,
            forecast_weight_kg: fw,
            forecast_units: fu,
            forecast_revenue_rsd: fr,
        });
    }

    out.sort_by(|a, b| b.sum_weight_kg.partial_cmp(&a.sum_weight_kg).unwrap_or(std::cmp::Ordering::Equal));
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_trend_regression_simple_growth() {
        // series: 1000,1100,1200,... -> slope 100
        let series: Vec<f64> = (0..12).map(|i| 1000.0 + (i as f64) * 100.0).collect();
        let m = trend_regression(&series);
        assert!(m.a > 90.0 && m.a < 110.0);
        assert!(m.r2 > 0.95);
    }

    #[test]
    fn test_auto_mode_insufficient_history() {
        let series: Vec<f64> = vec![100.0, 120.0, 110.0, 130.0, 125.0];
        let m = trend_regression(&series);
        // regression works, but UI should gate auto mode by months>=6 (handled in meta warning)
        assert!(m.r2 >= 0.0);
    }

    #[test]
    fn test_stability() {
        let v = vec![0.0, 1.0, 0.0, 2.0];
        assert!((stability(&v) - 0.5).abs() < 1e-9);
    }
}

