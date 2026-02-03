import { warnPush } from "@/logger";

export function parseDateString(dateString: string): Date | null {
    if (dateString.length !== 14) {
        warnPush("Invalid date string length. Expected format: 'YYYYMMDDHHmmss'");
        return null;
    }

    const year = parseInt(dateString.slice(0, 4), 10);
    const month = parseInt(dateString.slice(4, 6), 10) - 1; // 月份从 0 开始
    const day = parseInt(dateString.slice(6, 8), 10);
    const hours = parseInt(dateString.slice(8, 10), 10);
    const minutes = parseInt(dateString.slice(10, 12), 10);
    const seconds = parseInt(dateString.slice(12, 14), 10);

    const date = new Date(year, month, day, hours, minutes, seconds);

    if (isNaN(date.getTime())) {
        warnPush("Invalid date components.");
        return null;
    }

    return date;
}

export function generateUUID() {
    let uuid = '';
    let i = 0;
    let random = 0;

    for (i = 0; i < 36; i++) {
        if (i === 8 || i === 13 || i === 18 || i === 23) {
            uuid += '-';
        } else if (i === 14) {
            uuid += '4';
        } else {
            random = Math.random() * 16 | 0;
            if (i === 19) {
                random = (random & 0x3) | 0x8;
            }
            uuid += (random).toString(16);
        }
    }

    return uuid;
}


/**
 * 休息一下，等待
 * @param time 单位毫秒
 * @returns 
 */
export function sleep(time:number){
    return new Promise((resolve) => setTimeout(resolve, time));
}