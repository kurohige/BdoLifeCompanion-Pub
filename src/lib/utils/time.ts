/**
 * Wall-clock formatters for the mini mode dual-clock cluster.
 * Local uses the user's system timezone; "Server" is BDO's canonical UTC.
 */

const pad2 = (n: number) => String(n).padStart(2, "0");

export function fmt24(d: Date, withSeconds = true): string {
	const s = `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
	return withSeconds ? `${s}:${pad2(d.getSeconds())}` : s;
}

export function fmtServer(d: Date, withSeconds = true): string {
	const s = `${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}`;
	return withSeconds ? `${s}:${pad2(d.getUTCSeconds())}` : s;
}

function to12h(h: number): { hh: number; period: "AM" | "PM" } {
	const period: "AM" | "PM" = h < 12 ? "AM" : "PM";
	const hh = h % 12 === 0 ? 12 : h % 12;
	return { hh, period };
}

export function fmt12(d: Date, withSeconds = true): string {
	const { hh, period } = to12h(d.getHours());
	const s = `${pad2(hh)}:${pad2(d.getMinutes())}`;
	const tail = withSeconds ? `:${pad2(d.getSeconds())}` : "";
	return `${s}${tail} ${period}`;
}

export function fmtServer12(d: Date, withSeconds = true): string {
	const { hh, period } = to12h(d.getUTCHours());
	const s = `${pad2(hh)}:${pad2(d.getUTCMinutes())}`;
	const tail = withSeconds ? `:${pad2(d.getUTCSeconds())}` : "";
	return `${s}${tail} ${period}`;
}
