import type { SceneLayout } from './schema.js';

const shade = (hex: string, amount: number): string => {
  const value = hex.replace('#', '');
  const channel = (offset: number): number => {
    const raw = Number.parseInt(value.slice(offset, offset + 2), 16);
    return Math.max(0, Math.min(255, Math.round(raw * (1 - amount))));
  };
  return `#${[0, 2, 4].map((offset) => channel(offset).toString(16).padStart(2, '0')).join('')}`;
};

/**
 * 俯视图 SVG：用于人眼评审"好不好看"，也方便把 badcase 直接贴进数据集。
 * 只表达结构与比例，不追求美术效果。
 */
export function renderSceneSvg(
  layout: SceneLayout,
  options: {
    art?: Map<string, Buffer>;
    artUrl?: (prefab: string) => string | undefined;
    artSize?: (prefab: string) => { width: number; height: number } | undefined;
    /** 与 Godot 导出保持一致：tile 铺满，billboard 底边对齐并向上溢出 */
    artStyle?: 'tile' | 'billboard';
  } = {},
): string {
  const t = 12;
  const width = layout.bounds.width * t;
  const height = layout.bounds.height * t;
  const parts: string[] = [];

  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">`);
  parts.push(`<rect width="${width}" height="${height}" fill="${layout.palette.ground}"/>`);

  for (const lot of layout.lots) {
    const color = lot.kind === 'plaza'
      ? layout.palette.plaza
      : lot.kind === 'green'
        ? layout.palette.green
        : lot.kind === 'water'
          ? layout.palette.water
          : null;
    if (!color) continue;
    parts.push(
      `<rect x="${lot.rect.x * t}" y="${lot.rect.y * t}" width="${lot.rect.w * t}" height="${lot.rect.h * t}" fill="${color}"/>`,
    );
  }

  for (const road of layout.roads) {
    const points = road.points.map(([x, y]) => `${x * t},${y * t}`).join(' ');
    parts.push(
      `<polyline points="${points}" fill="none" stroke="${layout.palette.road}" stroke-width="${road.width * t}" stroke-linecap="round" stroke-linejoin="round"/>`,
    );
    parts.push(
      `<polyline points="${points}" fill="none" stroke="${shade(layout.palette.road, 0.25)}" stroke-width="${Math.max(1, t / 4)}" stroke-dasharray="${t} ${t * 1.4}" opacity="0.5"/>`,
    );
  }

  for (const building of layout.buildings) {
    const x = building.rect.x * t;
    const y = building.rect.y * t;
    const w = building.rect.w * t;
    const h = building.rect.h * t;
    const roofShade = shade(building.color, 0.22);
    const inner = Math.max(2, Math.min(w, h) * 0.12);
    const art = options.art?.get(building.prefab);
    const artLink = options.artUrl?.(building.prefab);
    if (art || artLink) {
      // 有素材就铺贴图：优先用 URL（可缓存、SVG 不会膨胀），否则内嵌 data-uri
      const href = artLink ?? `data:image/png;base64,${(art as Buffer).toString('base64')}`;
      if (options.artStyle === 'billboard') {
        const size = options.artSize?.(building.prefab);
        const scale = size ? w / size.width : 1;
        const drawH = size ? size.height * scale : h;
        // 底边落在 footprint 底边，向上溢出
        parts.push(
          `<image x="${x}" y="${(y + h - drawH).toFixed(2)}" width="${w}" height="${drawH.toFixed(2)}" href="${href}" preserveAspectRatio="none"/>`,
        );
        parts.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="${roofShade}" stroke-width="0.5" stroke-dasharray="2 2" opacity="0.35"/>`);
      } else {
        parts.push(`<image x="${x}" y="${y}" width="${w}" height="${h}" href="${href}" preserveAspectRatio="none"/>`);
      }
      parts.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="${roofShade}" stroke-width="0.6" opacity="0.5"/>`);
      const [ex, ey] = building.entrance;
      parts.push(
        `<rect x="${ex * t + t * 0.28}" y="${ey * t + t * 0.28}" width="${t * 0.44}" height="${t * 0.44}" fill="${roofShade}" rx="1"/>`,
      );
      continue;
    }
    parts.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${building.color}" stroke="${roofShade}" stroke-width="1.5"/>`);
    if (building.roof === 'gable') {
      parts.push(
        `<line x1="${x + w / 2}" y1="${y + inner}" x2="${x + w / 2}" y2="${y + h - inner}" stroke="${roofShade}" stroke-width="1.2"/>`,
      );
    } else if (building.roof === 'hip') {
      parts.push(
        `<line x1="${x + inner}" y1="${y + h / 2}" x2="${x + w - inner}" y2="${y + h / 2}" stroke="${roofShade}" stroke-width="1.2"/>`,
        `<line x1="${x + w / 2}" y1="${y + inner}" x2="${x + w / 2}" y2="${y + h - inner}" stroke="${roofShade}" stroke-width="1.2"/>`,
      );
    }
    // 正门：朝路一侧的开口
    const [ex, ey] = building.entrance;
    parts.push(
      `<rect x="${ex * t + t * 0.28}" y="${ey * t + t * 0.28}" width="${t * 0.44}" height="${t * 0.44}" fill="${roofShade}" rx="1"/>`,
    );
  }

  for (const prop of layout.props) {
    const cx = prop.at[0] * t + t / 2;
    const cy = prop.at[1] * t + t / 2;
    if (prop.type === 'tree') {
      parts.push(
        `<circle cx="${cx}" cy="${cy}" r="${t * 0.62}" fill="${shade(layout.palette.green, 0.55)}" opacity="0.35"/>`,
        `<circle cx="${cx}" cy="${cy}" r="${t * 0.45}" fill="${shade(layout.palette.green, 0.62)}"/>`,
      );
    } else if (prop.type === 'well') {
      parts.push(
        `<circle cx="${cx}" cy="${cy}" r="${t * 0.5}" fill="#8a8f98" stroke="#5f646d" stroke-width="1.4"/>`,
        `<circle cx="${cx}" cy="${cy}" r="${t * 0.22}" fill="#3f6f8f"/>`,
      );
    } else if (prop.type === 'lamp') {
      parts.push(`<circle cx="${cx}" cy="${cy}" r="${Math.max(1.4, t * 0.16)}" fill="#f2c14e"/>`);
    } else if (prop.type === 'dock') {
      parts.push(
        `<rect x="${cx - t * 0.5}" y="${cy - t * 0.3}" width="${t}" height="${t * 0.6}" fill="#8b5e3c"/>`,
      );
    } else if (prop.type === 'crate') {
      parts.push(`<rect x="${cx - t * 0.3}" y="${cy - t * 0.3}" width="${t * 0.6}" height="${t * 0.6}" fill="#a9793f"/>`);
    } else if (prop.type === 'sign') {
      parts.push(`<rect x="${cx - t * 0.1}" y="${cy - t * 0.5}" width="${t * 0.2}" height="${t}" fill="#6b7280"/>`);
    } else {
      parts.push(`<circle cx="${cx}" cy="${cy}" r="${Math.max(1, t * 0.12)}" fill="#e07aa8"/>`);
    }
  }

  for (const anchor of layout.anchors) {
    const cx = anchor.at[0] * t + t / 2;
    const cy = anchor.at[1] * t + t / 2;
    const color = anchor.kind === 'spawn' ? '#2f9e5f' : anchor.kind === 'exit' ? '#c94f4f' : '#3b7dd8';
    parts.push(
      `<circle cx="${cx}" cy="${cy}" r="${t * 0.55}" fill="none" stroke="${color}" stroke-width="2"/>`,
      `<circle cx="${cx}" cy="${cy}" r="${t * 0.16}" fill="${color}"/>`,
    );
  }

  parts.push('</svg>');
  return parts.join('\n');
}
