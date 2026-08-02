import { EffectGlyph } from '@coderline/alphatab/rendering/glyphs/EffectGlyph';
import { type SustainPedalMarker, SustainPedalMarkerType } from '@coderline/alphatab/model/Bar';
import { MusicFontSymbol } from '@coderline/alphatab/model/MusicFontSymbol';
import { CanvasHelper, type ICanvas } from '@coderline/alphatab/platform/ICanvas';

/**
 * @internal
 */
export class SustainPedalGlyph extends EffectGlyph {

    public constructor() {
        super(0, 0);
    }

    public override doLayout(): void {
        super.doLayout();
        this.height = this.renderer.smuflMetrics.glyphHeights.get(MusicFontSymbol.KeyboardPedalPed)!;
    }

    public override paint(cx: number, cy: number, canvas: ICanvas): void {
        const renderer = this.renderer;

        const y = cy + this.y;
        const h = this.height;

        const markers = renderer.bar.sustainPedals;

        const textWidth = this.renderer.smuflMetrics.glyphWidths.get(MusicFontSymbol.KeyboardPedalPed)!;

        let markerIndex = 0;
        while (markerIndex < markers.length) {
            let marker: SustainPedalMarker | null = markers[markerIndex];
            while (marker != null) {
                const markerX = cx + this.renderer.getRatioPositionX(marker.ratioPosition);

                // real own marker
                let linePadding = 0;
                if (marker.pedalType === SustainPedalMarkerType.Down) {
                    if (!this._isImmediateRepedal(markers, markerIndex, marker)) {
                        CanvasHelper.fillMusicFontSymbolSafe(
                            canvas,
                            markerX,
                            y + h,
                            1,
                            MusicFontSymbol.KeyboardPedalPed,
                            true
                        );
                        linePadding = textWidth / 2 + this.renderer.smuflMetrics.sustainPedalLinePadding;
                    }
                } else if (marker.pedalType === SustainPedalMarkerType.Up) {
                    const lineThickness = this.renderer.smuflMetrics.pedalLineThickness;
                    canvas.fillRect(
                        markerX - lineThickness / 2,
                        y + h - this.renderer.smuflMetrics.oneStaffSpace,
                        lineThickness,
                        this.renderer.smuflMetrics.oneStaffSpace
                    );
                }

                // line to next marker or end-of-bar
                if (marker.nextPedalMarker) {
                    if (marker.nextPedalMarker.bar === marker.bar) {
                        let nextX = cx + this.renderer.getRatioPositionX(marker.nextPedalMarker.ratioPosition);

                        switch (marker.nextPedalMarker.pedalType) {
                            case SustainPedalMarkerType.Down:
                                nextX -= textWidth / 2;
                                break;
                            case SustainPedalMarkerType.Hold:
                                // no offset on hold
                                break;
                            case SustainPedalMarkerType.Up:
                                // the line ends at the release hook
                                break;
                        }

                        const startX = markerX + linePadding;
                        if (nextX > startX) {
                            canvas.fillRect(startX, y + h - this.renderer.smuflMetrics.pedalLineThickness, nextX - startX, this.renderer.smuflMetrics.pedalLineThickness);
                        }
                    } else {
                        const nextX = cx + this.x + this.width;
                        const startX = markerX + linePadding;
                        canvas.fillRect(startX, y + h - this.renderer.smuflMetrics.pedalLineThickness, nextX - startX, this.renderer.smuflMetrics.pedalLineThickness);
                    }
                }

                // line from bar start to initial marker
                if (markerIndex === 0 && marker.previousPedalMarker) {
                    const startX = cx + this.x;
                    const endX = markerX - linePadding;
                    canvas.fillRect(startX, y + h - this.renderer.smuflMetrics.pedalLineThickness, endX - startX, this.renderer.smuflMetrics.pedalLineThickness);
                }

                markerIndex++;

                if (marker.nextPedalMarker != null && marker.nextPedalMarker.bar !== marker.bar) {
                    marker = null;
                    markerIndex = markers.length;
                } else {
                    marker = marker.nextPedalMarker;
                }
            }
        }
    }

    private _isImmediateRepedal(
        markers: SustainPedalMarker[],
        markerIndex: number,
        marker: SustainPedalMarker
    ): boolean {
        if (marker.pedalType !== SustainPedalMarkerType.Down) {
            return false;
        }

        if (markerIndex > 0) {
            const sameBarPreviousMarker = markers[markerIndex - 1];
            return (
                sameBarPreviousMarker.pedalType === SustainPedalMarkerType.Up &&
                sameBarPreviousMarker.ratioPosition === marker.ratioPosition
            );
        }

        if (marker.ratioPosition !== 0 || !this.renderer.bar.previousBar) {
            return false;
        }

        const previousMarkers = this.renderer.bar.previousBar.sustainPedals;
        if (previousMarkers.length === 0) {
            return false;
        }

        const previousBarMarker = previousMarkers[previousMarkers.length - 1];
        const previousRenderer = this.renderer.previousRenderer;
        return (
            previousBarMarker.pedalType === SustainPedalMarkerType.Up &&
            previousBarMarker.ratioPosition === 1 &&
            previousRenderer !== null &&
            previousRenderer.staff === this.renderer.staff
        );
    }
}
