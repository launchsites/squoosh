const TINY_PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFgwJ/lH6i4gAAAABJRU5ErkJggg==', 'base64');
async function trySquooshEncode(pool, codec, options) {
    try {
        const image = pool.ingestImage(TINY_PNG);
        await image.encode({ [codec]: options });
        const encoded = image.encodedWith[codec];
        return Boolean(encoded?.binary?.length);
    }
    catch {
        return false;
    }
}
export async function detectSquooshSupport() {
    const major = Number(process.versions.node.split('.')[0] ?? 0);
    if (major >= 20) {
        return {
            mozjpeg: false,
            webp: false,
            avif: false,
            oxipng: false,
            jxl: false,
            wp2: false,
        };
    }
    let ImagePoolCtor = null;
    try {
        const module = await import('@squoosh/lib');
        ImagePoolCtor = module.ImagePool;
    }
    catch {
        return {
            mozjpeg: false,
            webp: false,
            avif: false,
            oxipng: false,
            jxl: false,
            wp2: false,
        };
    }
    const pool = new ImagePoolCtor(1);
    const support = {
        mozjpeg: false,
        webp: false,
        avif: false,
        oxipng: false,
        jxl: false,
        wp2: false,
    };
    support.mozjpeg = await trySquooshEncode(pool, 'mozjpeg', { quality: 75 });
    support.webp = await trySquooshEncode(pool, 'webp', { quality: 75 });
    support.avif = await trySquooshEncode(pool, 'avif', { cqLevel: 30 });
    support.oxipng = await trySquooshEncode(pool, 'oxipng', { level: 2 });
    support.jxl = await trySquooshEncode(pool, 'jxl', { quality: 75 });
    support.wp2 = await trySquooshEncode(pool, 'wp2', { quality: 75 });
    pool.close();
    return support;
}
export function mapQualityToAvifCq(quality) {
    const q = Math.min(100, Math.max(1, quality));
    let cq;
    if (q >= 75) {
        const t = (q - 75) / 25;
        cq = 30 + (10 - 30) * t;
    }
    else if (q >= 50) {
        const t = (q - 50) / 25;
        cq = 40 + (30 - 40) * t;
    }
    else if (q >= 25) {
        const t = (q - 25) / 25;
        cq = 50 + (40 - 50) * t;
    }
    else {
        const t = (q - 1) / 24;
        cq = 60 + (50 - 60) * t;
    }
    return Math.min(63, Math.max(0, Math.round(cq)));
}
export function getMenuOptions(support) {
    const mozjpegUsesSquoosh = support.mozjpeg;
    return [
        {
            id: 'avif',
            label: 'AVIF',
            ext: 'avif',
            lossy: true,
            supportsQuality: true,
            encoderType: support.avif ? 'squoosh' : 'sharp',
            squooshCodec: support.avif ? 'avif' : undefined,
            sharpFormat: support.avif ? undefined : 'avif',
        },
        {
            id: 'browser-gif',
            label: 'Browser GIF',
            ext: 'gif',
            lossy: true,
            supportsQuality: false,
            encoderType: 'unsupported',
        },
        {
            id: 'browser-jpeg',
            label: 'Browser JPEG',
            ext: 'jpg',
            lossy: true,
            supportsQuality: true,
            encoderType: 'sharp',
            sharpFormat: 'jpeg',
        },
        {
            id: 'browser-png',
            label: 'Browser PNG',
            ext: 'png',
            lossy: false,
            supportsQuality: false,
            encoderType: 'sharp',
            sharpFormat: 'png',
        },
        {
            id: 'jxl',
            label: 'JPEG XL (beta)',
            ext: 'jxl',
            lossy: true,
            supportsQuality: true,
            encoderType: support.jxl ? 'squoosh' : 'unsupported',
            squooshCodec: support.jxl ? 'jxl' : undefined,
        },
        {
            id: 'mozjpeg',
            label: mozjpegUsesSquoosh ? 'MozJPEG' : 'JPEG fallback (not true MozJPEG)',
            ext: 'jpg',
            lossy: true,
            supportsQuality: true,
            encoderType: mozjpegUsesSquoosh ? 'squoosh' : 'sharp',
            squooshCodec: mozjpegUsesSquoosh ? 'mozjpeg' : undefined,
            sharpFormat: mozjpegUsesSquoosh ? undefined : 'jpeg',
            isFallback: !mozjpegUsesSquoosh,
        },
        {
            id: 'oxipng',
            label: 'OxiPNG',
            ext: 'png',
            lossy: false,
            supportsQuality: false,
            encoderType: support.oxipng ? 'squoosh' : 'unsupported',
            squooshCodec: support.oxipng ? 'oxipng' : undefined,
        },
        {
            id: 'qoi',
            label: 'QOI',
            ext: 'qoi',
            lossy: false,
            supportsQuality: false,
            encoderType: 'unsupported',
        },
        {
            id: 'webp',
            label: 'WebP',
            ext: 'webp',
            lossy: true,
            supportsQuality: true,
            encoderType: support.webp ? 'squoosh' : 'sharp',
            squooshCodec: support.webp ? 'webp' : undefined,
            sharpFormat: support.webp ? undefined : 'webp',
        },
        {
            id: 'wp2',
            label: 'WebP v2 (unstable)',
            ext: 'wp2',
            lossy: true,
            supportsQuality: true,
            encoderType: support.wp2 ? 'squoosh' : 'unsupported',
            squooshCodec: support.wp2 ? 'wp2' : undefined,
        },
        {
            id: 'original',
            label: 'Original image (copy)',
            ext: 'original',
            lossy: false,
            supportsQuality: false,
            encoderType: 'copy',
        },
    ];
}
export function getSquooshEncodeOptions(id, quality) {
    switch (id) {
        case 'mozjpeg':
            return { quality };
        case 'webp':
            return { quality };
        case 'avif':
            return { cqLevel: mapQualityToAvifCq(quality) };
        case 'oxipng':
            return { level: 4 };
        case 'jxl':
            return { quality };
        case 'wp2':
            return { quality };
        default:
            return {};
    }
}
