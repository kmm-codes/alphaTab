/**
 * Page-layout geometry contract. The PlayMorePiano adapter exercises the generated C# API and
 * snapshot projection separately.
 *
 * @target web
 */
import { ScoreLoader } from '@coderline/alphatab/importer/ScoreLoader';
import { LayoutMode } from '@coderline/alphatab/LayoutMode';
import type { Beat } from '@coderline/alphatab/model/Beat';
import { ScoreRenderer } from '@coderline/alphatab/rendering/ScoreRenderer';
import type { BoundsLookup } from '@coderline/alphatab/rendering/utils/BoundsLookup';
import { Settings } from '@coderline/alphatab/Settings';
import { VisualTestHelper } from 'test/visualTests/VisualTestHelper';
import { describe, expect, it } from 'vitest';

/** @internal */
interface RenderResult {
    beats: Beat[];
    lookup: BoundsLookup;
    renderer: ScoreRenderer;
    scale: number;
}

async function render(firstBeatPaddingLeft: number): Promise<RenderResult> {
    await VisualTestHelper.prepareAlphaSkia();
    const settings = new Settings();
    VisualTestHelper.prepareSettingsForTest(settings);
    settings.core.includeNoteBounds = true;
    settings.display.layoutMode = LayoutMode.Page;
    settings.display.barsPerRow = 2;
    settings.display.scale = 1.25;
    settings.display.firstBeatPaddingLeft = firstBeatPaddingLeft;

    const score = ScoreLoader.loadAlphaTex(
        '\\track "pno." :4 C4 D4 E4 F4 | G4 A4 B4 C5 | D5 C5 B4 A4 | G4 F4 E4 D4 |',
        settings
    );
    const renderer = new ScoreRenderer(settings);
    renderer.width = 900;
    let renderError: Error | null = null;
    renderer.error.on(error => {
        renderError = error;
    });
    renderer.renderScore(score, [0]);
    renderError = renderError as Error | null;
    if (renderError !== null) {
        throw renderError;
    }

    return {
        beats: score.tracks[0].staves[0].bars.flatMap(bar => bar.voices[0].beats),
        lookup: renderer.boundsLookup!,
        renderer,
        scale: settings.display.scale
    };
}

function beatX(result: RenderResult, beat: Beat): number {
    return result.lookup.findBeat(beat)!.onNotesX;
}

describe('DisplaySettings.firstBeatPaddingLeft', () => {
    it('reserves post-header space in every page system without changing musical identity or time', async () => {
        const padding = 80;
        const baseline = await render(0);
        const padded = await render(padding);

        try {
            expect(baseline.lookup.staffSystems.length).toBe(2);
            expect(padded.lookup.staffSystems.length).toBe(2);
            expect(padded.beats.length).toBe(baseline.beats.length);

            for (let systemIndex = 0; systemIndex < 2; systemIndex++) {
                const baselineSystem = baseline.lookup.staffSystems[systemIndex];
                const paddedSystem = padded.lookup.staffSystems[systemIndex];
                const firstBarIndex = baselineSystem.bars[0].index;
                const baselineBeats = baseline.beats.filter(beat => beat.voice.bar.index === firstBarIndex);
                const paddedBeats = padded.beats.filter(beat => beat.voice.bar.index === firstBarIndex);

                const scaledPadding = padding * padded.scale;
                expect(beatX(padded, paddedBeats[0]) - beatX(baseline, baselineBeats[0])).toBeCloseTo(
                    scaledPadding,
                    5
                );
                const gutter = paddedSystem.firstBeatPaddingBounds;
                expect(gutter).not.toBeNull();
                expect(gutter!.w).toBeCloseTo(scaledPadding, 5);
                expect(gutter!.x).toBeGreaterThan(paddedSystem.bars[0].lineAlignedBounds.x);
                expect(gutter!.x + gutter!.w).toBeLessThanOrEqual(beatX(padded, paddedBeats[0]));

                const spacingRatios: number[] = [];
                for (let beatIndex = 1; beatIndex < baselineBeats.length; beatIndex++) {
                    const baselineDistance = beatX(baseline, baselineBeats[beatIndex]) - beatX(baseline, baselineBeats[beatIndex - 1]);
                    const paddedDistance = beatX(padded, paddedBeats[beatIndex]) - beatX(padded, paddedBeats[beatIndex - 1]);
                    spacingRatios.push(paddedDistance / baselineDistance);
                }
                expect(Math.min(...spacingRatios)).toBeGreaterThan(0);
                expect(Math.max(...spacingRatios) - Math.min(...spacingRatios)).toBeLessThan(0.001);
                expect(baselineSystem.firstBeatPaddingBounds).toBeNull();
            }

            for (let beatIndex = 0; beatIndex < baseline.beats.length; beatIndex++) {
                expect(padded.beats[beatIndex].absolutePlaybackStart).toBe(
                    baseline.beats[beatIndex].absolutePlaybackStart
                );
                expect(padded.beats[beatIndex].notes.length).toBe(baseline.beats[beatIndex].notes.length);
            }
        } finally {
            baseline.renderer.destroy();
            padded.renderer.destroy();
        }
    });
});
