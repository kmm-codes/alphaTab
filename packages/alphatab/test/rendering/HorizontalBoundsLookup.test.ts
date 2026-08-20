import { ScoreLoader } from '@coderline/alphatab/importer/ScoreLoader';
import { LayoutMode } from '@coderline/alphatab/LayoutMode';
import type { RenderFinishedEventArgs } from '@coderline/alphatab/rendering/RenderFinishedEventArgs';
import { ScoreRenderer } from '@coderline/alphatab/rendering/ScoreRenderer';
import { Settings } from '@coderline/alphatab/Settings';
import { VisualTestHelper } from 'test/visualTests/VisualTestHelper';
import { describe, expect, it } from 'vitest';

describe('HorizontalBoundsLookup', () => {
    it('registers the completed horizontal system exactly once while preserving partial order', async () => {
        await VisualTestHelper.prepareAlphaSkia();
        const settings = new Settings();
        VisualTestHelper.prepareSettingsForTest(settings);
        settings.core.enableLazyLoading = true;
        settings.core.includeNoteBounds = true;
        settings.display.layoutMode = LayoutMode.Horizontal;
        settings.display.barCountPerPartial = 1;

        let tex = '\\track "pno." :4 ';
        const barCount = 16;
        for (let i = 0; i < barCount; i++) {
            tex += 'C4 D4 E4 F4 | ';
        }

        const score = ScoreLoader.loadAlphaTex(tex, settings);
        const renderer = new ScoreRenderer(settings);
        renderer.width = 1152;
        const musicalPartials: RenderFinishedEventArgs[] = [];
        let renderError: Error | null = null;
        renderer.partialLayoutFinished.on(result => {
            if (result.firstMasterBarIndex >= 0) {
                musicalPartials.push(result);
            }
        });
        renderer.error.on(error => {
            renderError = error;
        });

        renderer.renderScore(score, [0]);
        renderError = renderError as Error | null;
        if (renderError !== null) {
            throw renderError;
        }

        const lookup = renderer.boundsLookup!;
        expect(lookup.isFinished).toBe(true);
        expect(lookup.staffSystems.length).toBe(1);
        expect(lookup.staffSystems[0].bars.length).toBe(barCount);

        let beatBounds = 0;
        for (const masterBar of lookup.staffSystems[0].bars) {
            for (const bar of masterBar.bars) {
                beatBounds += bar.beats.length;
            }
        }
        expect(beatBounds).toBe(barCount * 4);

        const firstBeat = score.tracks[0].staves[0].bars[0].voices[0].beats[0];
        expect(lookup.findBeats(firstBeat)!.length).toBe(1);
        expect(musicalPartials.length).toBe(barCount);
        for (let i = 0; i < musicalPartials.length; i++) {
            expect(musicalPartials[i].firstMasterBarIndex).toBe(i);
            expect(musicalPartials[i].lastMasterBarIndex).toBe(i);
        }

        renderer.destroy();
    });
});
