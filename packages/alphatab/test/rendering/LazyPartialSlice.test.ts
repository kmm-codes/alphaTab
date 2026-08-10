import { AlphaSkiaCanvas, type AlphaSkiaImage } from '@coderline/alphaskia';
import { ScoreLoader } from '@coderline/alphatab/importer/ScoreLoader';
import { LayoutMode } from '@coderline/alphatab/LayoutMode';
import type { RenderFinishedEventArgs } from '@coderline/alphatab/rendering/RenderFinishedEventArgs';
import { ScoreRenderer } from '@coderline/alphatab/rendering/ScoreRenderer';
import { Settings } from '@coderline/alphatab/Settings';
import { VisualTestHelper } from 'test/visualTests/VisualTestHelper';
import { describe, expect, it } from 'vitest';

describe('LazyPartialSlice', () => {
    it('replays a cross-bar partial pixel-exactly into bounded targets', async () => {
        await VisualTestHelper.prepareAlphaSkia();
        const settings = new Settings();
        VisualTestHelper.prepareSettingsForTest(settings);
        settings.core.enableLazyLoading = true;
        settings.display.layoutMode = LayoutMode.Horizontal;
        settings.display.barCountPerPartial = 6;
        settings.display.scale = 2.5;

        const score = ScoreLoader.loadAlphaTex(
            `
            \\track "pno."
            :4 C4 { spd } C4 C4 C4 |
            D4 D4 D4 D4 |
            E4 E4 E4 E4 |
            F4 F4 F4 F4 |
            G4 G4 G4 G4 |
            A4 A4 A4 A4 { spu }
            `,
            settings
        );
        const renderer = new ScoreRenderer(settings);
        renderer.width = 4000;
        let sourceArgs: RenderFinishedEventArgs | null = null;
        let sourceImage: AlphaSkiaImage | null = null;
        const sliceResults: RenderFinishedEventArgs[] = [];
        let scaledResult: RenderFinishedEventArgs | null = null;
        let renderError: Error | null = null;

        renderer.partialRenderFinished.on(result => {
            if (result.rasterScale === 1.25) {
                scaledResult = result;
            } else if (result.id.includes(':')) {
                sliceResults.push(result);
            } else if (result.firstMasterBarIndex === 0) {
                sourceImage = result.renderResult as AlphaSkiaImage;
            }
        });
        renderer.partialLayoutFinished.on(result => {
            if (result.firstMasterBarIndex !== 0) {
                return;
            }

            sourceArgs = result;
            renderer.renderResult(result.id);
            for (let x = 0; x < result.width; x += 2048) {
                renderer.renderResultSlice(result.id, x, Math.min(2048, result.width - x));
            }
            renderer.renderResultSlice(result.id, 0, result.width, 1.25);
        });
        renderer.error.on(error => {
            renderError = error;
        });

        renderer.renderScore(score, [0]);

        renderError = renderError as Error | null;
        if (renderError !== null) {
            throw renderError;
        }
        sourceArgs = sourceArgs as RenderFinishedEventArgs | null;
        sourceImage = sourceImage as AlphaSkiaImage | null;
        expect(sourceArgs).not.toBeNull();
        expect(sourceImage).not.toBeNull();
        expect(sliceResults.length).toBeGreaterThan(1);
        scaledResult = scaledResult as RenderFinishedEventArgs | null;
        expect(scaledResult).not.toBeNull();

        const source = sourceImage!;
        using composedCanvas = new AlphaSkiaCanvas();
        composedCanvas.beginRender(source.width, source.height);
        let nextX = 0;
        for (const slice of sliceResults) {
            using image = slice.renderResult as AlphaSkiaImage;
            const localX = slice.x - sourceArgs!.x;
            expect(localX).toBe(nextX);
            expect(image.width).toBeLessThanOrEqual(2048);
            composedCanvas.drawImage(image, localX, 0, slice.width, slice.height);
            nextX += image.width;
        }
        expect(nextX).toBe(source.width);

        using composed = composedCanvas.endRender()!;
        const sourcePixels = new Uint8Array(source.readPixels()!);
        const composedPixels = new Uint8Array(composed.readPixels()!);
        expect(composedPixels.length).toBe(sourcePixels.length);
        let differentPixels = 0;
        for (let i = 0; i < sourcePixels.length; i += 4) {
            if (
                sourcePixels[i] !== composedPixels[i] ||
                sourcePixels[i + 1] !== composedPixels[i + 1] ||
                sourcePixels[i + 2] !== composedPixels[i + 2] ||
                sourcePixels[i + 3] !== composedPixels[i + 3]
            ) {
                differentPixels++;
            }
        }
        expect(differentPixels).toBe(0);

        using scaledImage = scaledResult!.renderResult as AlphaSkiaImage;
        expect(scaledResult!.x).toBe(sourceArgs!.x);
        expect(scaledResult!.width).toBe(sourceArgs!.width);
        expect(scaledResult!.height).toBe(sourceArgs!.height);
        expect(scaledResult!.rasterScale).toBe(1.25);
        expect(
            Math.abs(scaledImage.width - Math.round((source.width / settings.display.scale) * 1.25))
        ).toBeLessThanOrEqual(1);
        expect(
            Math.abs(scaledImage.height - Math.round((source.height / settings.display.scale) * 1.25))
        ).toBeLessThanOrEqual(1);

        source[Symbol.dispose]();
        renderer.destroy();
    });
});
