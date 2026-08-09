import type { Beat } from '@coderline/alphatab/model/Beat';
import { SustainPedalMarkerType } from '@coderline/alphatab/model/Bar';
import { NotationElement } from '@coderline/alphatab/NotationSettings';
import type { BarRendererBase } from '@coderline/alphatab/rendering/BarRendererBase';
import { EffectBarGlyphSizing } from '@coderline/alphatab/rendering/EffectBarGlyphSizing';
import { EffectBandPlacementCategory, EffectInfo } from '@coderline/alphatab/rendering/EffectInfo';
import type { EffectGlyph } from '@coderline/alphatab/rendering/glyphs/EffectGlyph';
import { SustainPedalGlyph } from '@coderline/alphatab/rendering/glyphs/SustainPedalGlyph';
import type { Settings } from '@coderline/alphatab/Settings';

/**
 * @internal
 */
export class SustainPedalEffectInfo extends EffectInfo {
    public get notationElement(): NotationElement {
        return NotationElement.EffectSustainPedal;
    }

    public get hideOnMultiTrack(): boolean {
        return false;
    }

    public get sizingMode(): EffectBarGlyphSizing {
        return EffectBarGlyphSizing.FullBar;
    }

    public shouldCreateGlyph(_settings: Settings, beat: Beat): boolean {
        return beat.voice.index === 0 && beat.index === 0 && beat.voice.bar.sustainPedals.length > 0;
    }

    public createNewGlyph(_renderer: BarRendererBase, _beat: Beat): EffectGlyph {
        return new SustainPedalGlyph();
    }

    public canExpand(from: Beat, to: Beat): boolean {
        const fromBar = from.voice.bar;
        if (fromBar === to.voice.bar) {
            return true;
        }

        // across a barline the band should only stay linked while the pedal is actually held down.
        // returning true unconditionally kept every pedalled bar linked to its predecessor, which
        // in the horizontal screen layout means a partial is never completed and the whole score
        // ends up in a single oversized partial.
        const markers = fromBar.sustainPedals;
        if (markers.length === 0) {
            return false;
        }

        const last = markers[markers.length - 1];
        if (last.pedalType === SustainPedalMarkerType.Up) {
            return false;
        }

        return last.nextPedalMarker !== null && last.nextPedalMarker.bar !== fromBar;
    }
    public override get placementCategory(): EffectBandPlacementCategory {
        return EffectBandPlacementCategory.Span;
    }
}
