import { sectorConfig } from "@/config/sector.config";

const { locale, currency, timezone } = sectorConfig.company;

const currencyFmt = new Intl.NumberFormat(locale, { style: "currency", currency });
const numberFmt = new Intl.NumberFormat(locale);
const percentFmt = new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 0 });
const dateFmt = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: timezone });
const timeFmt = new Intl.DateTimeFormat(locale, { timeStyle: "short", timeZone: timezone });

export const formatMoney = (amount: number | string) => currencyFmt.format(Number(amount));
export const formatNumber = (n: number | string) => numberFmt.format(Number(n));
export const formatPercent = (ratio: number) => percentFmt.format(ratio);
export const formatDate = (d: string | Date) => dateFmt.format(new Date(d));
export const formatTime = (d: string | Date) => timeFmt.format(new Date(d));
