import type { Color } from '@coderline/alphatab/model/Color';
import type { Font } from '@coderline/alphatab/model/Font';
import type { MusicFontSymbol } from '@coderline/alphatab/model/MusicFontSymbol';
import type { ICanvas, MeasuredText, TextAlign, TextBaseline } from '@coderline/alphatab/platform/ICanvas';
import type { Settings } from '@coderline/alphatab/Settings';

/**
 * Replays an existing paint callback into a horizontally translated canvas.
 *
 * The wrapper does not own the wrapped canvas. Render lifetime methods are forwarded for interface
 * completeness, but slice rendering starts and finishes the wrapped canvas directly.
 * @internal
 */
export class TranslatedCanvas implements ICanvas {
    private readonly _canvas: ICanvas;
    private readonly _offsetX: number;

    public constructor(canvas: ICanvas, offsetX: number) {
        this._canvas = canvas;
        this._offsetX = offsetX;
    }

    public get settings(): Settings {
        return this._canvas.settings;
    }

    public set settings(value: Settings) {
        this._canvas.settings = value;
    }

    public get color(): Color {
        return this._canvas.color;
    }

    public set color(value: Color) {
        this._canvas.color = value;
    }

    public get lineWidth(): number {
        return this._canvas.lineWidth;
    }

    public set lineWidth(value: number) {
        this._canvas.lineWidth = value;
    }

    public get font(): Font {
        return this._canvas.font;
    }

    public set font(value: Font) {
        this._canvas.font = value;
    }

    public get textAlign(): TextAlign {
        return this._canvas.textAlign;
    }

    public set textAlign(value: TextAlign) {
        this._canvas.textAlign = value;
    }

    public get textBaseline(): TextBaseline {
        return this._canvas.textBaseline;
    }

    public set textBaseline(value: TextBaseline) {
        this._canvas.textBaseline = value;
    }

    public fillRect(x: number, y: number, w: number, h: number): void {
        this._canvas.fillRect(x + this._offsetX, y, w, h);
    }

    public strokeRect(x: number, y: number, w: number, h: number): void {
        this._canvas.strokeRect(x + this._offsetX, y, w, h);
    }

    public fillCircle(x: number, y: number, radius: number): void {
        this._canvas.fillCircle(x + this._offsetX, y, radius);
    }

    public strokeCircle(x: number, y: number, radius: number): void {
        this._canvas.strokeCircle(x + this._offsetX, y, radius);
    }

    public beginGroup(identifier: string): void {
        this._canvas.beginGroup(identifier);
    }

    public endGroup(): void {
        this._canvas.endGroup();
    }

    public fillText(text: string, x: number, y: number): void {
        this._canvas.fillText(text, x + this._offsetX, y);
    }

    public measureText(text: string): MeasuredText {
        return this._canvas.measureText(text);
    }

    public fillMusicFontSymbol(
        x: number,
        y: number,
        relativeScale: number,
        symbol: MusicFontSymbol,
        centerAtPosition?: boolean
    ): void {
        this._canvas.fillMusicFontSymbol(x + this._offsetX, y, relativeScale, symbol, centerAtPosition);
    }

    public fillMusicFontSymbols(
        x: number,
        y: number,
        relativeScale: number,
        symbols: MusicFontSymbol[],
        centerAtPosition?: boolean
    ): void {
        this._canvas.fillMusicFontSymbols(x + this._offsetX, y, relativeScale, symbols, centerAtPosition);
    }

    public beginRender(width: number, height: number): void {
        this._canvas.beginRender(width, height);
    }

    public endRender(): unknown {
        return this._canvas.endRender();
    }

    public onRenderFinished(): unknown {
        return this._canvas.onRenderFinished();
    }

    public beginRotate(centerX: number, centerY: number, angle: number): void {
        this._canvas.beginRotate(centerX + this._offsetX, centerY, angle);
    }

    public endRotate(): void {
        this._canvas.endRotate();
    }

    public beginPath(): void {
        this._canvas.beginPath();
    }

    public closePath(): void {
        this._canvas.closePath();
    }

    public fill(): void {
        this._canvas.fill();
    }

    public stroke(): void {
        this._canvas.stroke();
    }

    public moveTo(x: number, y: number): void {
        this._canvas.moveTo(x + this._offsetX, y);
    }

    public lineTo(x: number, y: number): void {
        this._canvas.lineTo(x + this._offsetX, y);
    }

    public bezierCurveTo(
        cp1X: number,
        cp1Y: number,
        cp2X: number,
        cp2Y: number,
        x: number,
        y: number
    ): void {
        this._canvas.bezierCurveTo(
            cp1X + this._offsetX,
            cp1Y,
            cp2X + this._offsetX,
            cp2Y,
            x + this._offsetX,
            y
        );
    }

    public quadraticCurveTo(cpx: number, cpy: number, x: number, y: number): void {
        this._canvas.quadraticCurveTo(cpx + this._offsetX, cpy, x + this._offsetX, y);
    }

    public destroy(): void {
        // The wrapped canvas belongs to ScoreRenderer.
    }

}
