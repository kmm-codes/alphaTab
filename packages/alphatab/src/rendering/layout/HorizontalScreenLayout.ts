import { Logger } from '@coderline/alphatab/Logger';
import { SystemsLayoutMode } from '@coderline/alphatab/DisplaySettings';
import type { MasterBar } from '@coderline/alphatab/model/MasterBar';
import type { Score } from '@coderline/alphatab/model/Score';
import { TextAlign } from '@coderline/alphatab/platform/ICanvas';
import type { RenderHints } from '@coderline/alphatab/rendering/IScoreRenderer';
import { ScoreLayout } from '@coderline/alphatab/rendering/layout/ScoreLayout';
import { RenderFinishedEventArgs } from '@coderline/alphatab/rendering/RenderFinishedEventArgs';
import type { MasterBarsRenderers } from '@coderline/alphatab/rendering/staves/MasterBarsRenderers';
import type { StaffSystem } from '@coderline/alphatab/rendering/staves/StaffSystem';

/**
 * @internal
 */
export class HorizontalScreenLayoutPartialInfo {
    public x: number = 0;
    public width: number = 0;
    public masterBars: MasterBar[] = [];
    public results: MasterBarsRenderers[] = [];
}

/**
 * This layout arranges the bars all horizontally
 * @internal
 */
export class HorizontalScreenLayout extends ScoreLayout {
    private _system: StaffSystem | null = null;
    private _systems: StaffSystem[] = [];

    public override get systems(): StaffSystem[] {
        return this._systems;
    }

    public get name(): string {
        return 'HorizontalScreen';
    }

    public get supportsResize(): boolean {
        return false;
    }

    public get firstBarX(): number {
        let x = this.pagePadding![0];
        if (this._system) {
            x += this._system.accoladeWidth;
        }
        return x;
    }

    public doResize(): void {
        // not supported
    }

    public override doUpdateForBars(_renderHints: RenderHints): boolean {
        // not supported yet, modifications likely cause anyhow full updates
        // as we do not optimize effect bands yet. with effect bands being more
        // isolated in bars we could try updating dynamically
        return false;
    }

    protected doLayoutAndRender(renderHints: RenderHints | undefined): void {
        const score: Score = this.renderer.score!;

        let startIndex: number = this.renderer.settings.display.startBar;
        startIndex--; // map to array index

        startIndex = Math.min(score.masterBars.length - 1, Math.max(0, startIndex));
        let currentBarIndex: number = startIndex;
        let endBarIndex: number = this.renderer.settings.display.barCount;
        if (endBarIndex <= 0) {
            endBarIndex = score.masterBars.length;
        }
        endBarIndex = startIndex + endBarIndex - 1; // map count to array index

        endBarIndex = Math.min(score.masterBars.length - 1, Math.max(0, endBarIndex));
        this._system = this.createEmptyStaffSystem(0);
        this._systems.splice(0, this._systems.length);
        this._systems.push(this._system);
        // Each bar in horizontal layout is sized independently (by bar.displayWidth or the bar's
        // intrinsic width), so there is no shared staff width to distribute across bars. Keep each
        // bar's spring constants referenced against its own local minimum-duration so rendering
        // matches the historical per-bar behaviour.
        this._system.shareMinDurationAcrossBars = false;
        this._system.isLast = true;
        this._system.x = this.pagePadding![0];
        this._system.y = this.pagePadding![1];
        const countPerPartial: number = this.renderer.settings.display.barCountPerPartial;

        // Add every bar first and scale none of them yet: the strip is laid out at one single
        // stretch force, and that force can only be known once the last bar has been seen (#390).
        const allResults: MasterBarsRenderers[] = [];
        const allMasterBars: MasterBar[] = [];
        while (currentBarIndex <= endBarIndex) {
            const multiBarRestInfo = this.multiBarRestInfo;
            const additionalMultiBarsRestBarIndices: number[] | null =
                multiBarRestInfo !== null && multiBarRestInfo.has(currentBarIndex)
                    ? multiBarRestInfo.get(currentBarIndex)!
                    : null;

            const result = this._system.addBars(
                this.renderer.tracks!,
                currentBarIndex,
                additionalMultiBarsRestBarIndices
            );

            allResults.push(result);
            allMasterBars.push(score.masterBars[currentBarIndex]);
            currentBarIndex++;
        }

        // `SystemsLayoutMode.UseModelLayout` is the caller explicitly asking for the widths stored
        // in the model; a time axis and a per-bar width are mutually exclusive, so the model wins
        // there and the strip keeps the historical per-bar scaling. Everywhere else the strip is a
        // time axis and gets one force for all of it (#390).
        if (this.renderer.settings.display.systemsLayoutMode === SystemsLayoutMode.UseModelLayout) {
            for (const result of allResults) {
                this._scaleBarsToModelWidth(result);
            }
            this._tileBars(allResults);
        } else {
            const force = this._resolveUniformStretchForce(allResults);
            this._layOutTimeProportionally(allResults, force);
        }

        const partials: HorizontalScreenLayoutPartialInfo[] = [];
        let currentPartial: HorizontalScreenLayoutPartialInfo = new HorizontalScreenLayoutPartialInfo();
        for (let i = 0; i < allResults.length; i++) {
            const result = allResults[i];
            // complete partial if its full and we are not linked
            if (currentPartial.masterBars.length >= countPerPartial && !result.isLinkedToPrevious) {
                currentPartial = this._completePartial(partials, currentPartial);
            }

            currentPartial.results.push(result);
            currentPartial.masterBars.push(allMasterBars[i]);
            currentPartial.width += result.width;
        }

        // don't miss the last partial if not empty
        if (currentPartial.masterBars.length > 0) {
            this._completePartial(partials, currentPartial);
        }
        this._finalizeStaffSystem();

        this.height = Math.floor(this._system.y + this._system.height);
        this.width = this._system.x + this._system.width + this.pagePadding![2];
        currentBarIndex = 0;

        this._system.buildBoundingsLookup(0, 0);
        let x = 0;
        for (let i: number = 0; i < partials.length; i++) {
            const partial: HorizontalScreenLayoutPartialInfo = partials[i];

            const e = new RenderFinishedEventArgs();
            e.reuseViewport = renderHints?.reuseViewport ?? false;
            e.x = x;
            e.y = 0;
            e.totalWidth = this.width;
            e.totalHeight = this.height;
            e.width = partial.width;
            e.height = this.height;
            e.firstMasterBarIndex = partial.masterBars[0].index;
            e.lastMasterBarIndex = partial.masterBars[partial.masterBars.length - 1].index;

            x += partial.width;

            // pull to local scope for lambda
            const partialBarIndex = currentBarIndex;
            const partialIndex = i;
            this.registerPartial(e, canvas => {
                let renderX: number = this._system!.getBarX(partial.masterBars[0].index) + this._system!.accoladeWidth;
                if (partialIndex === 0) {
                    renderX -= this._system!.x + this._system!.accoladeWidth;
                }

                canvas.color = this.renderer.settings.display.resources.mainGlyphColor;
                canvas.textAlign = TextAlign.Left;
                Logger.debug(
                    this.name,
                    `Rendering partial from bar ${partial.masterBars[0].index} to ${partial.masterBars[partial.masterBars.length - 1].index}`,
                    null
                );
                this._system!.paintPartial(
                    -renderX,
                    this._system!.y,
                    canvas,
                    partialBarIndex,
                    partial.masterBars.length
                );
            });

            currentBarIndex += partial.masterBars.length;
        }

        this.height = this.layoutAndRenderBottomScoreInfo(this.height);
        this.height = this._layoutAndRenderAnnotation(this.height);

        this.height += this.pagePadding![3];

        this.height *= this.renderer.settings.display.scale;
    }

    /** Historical per-bar scaling, kept for {@link SystemsLayoutMode.UseModelLayout}. */
    private _scaleBarsToModelWidth(result: MasterBarsRenderers) {
        result.width = 0;
        for (const r of result.renderers) {
            const barDisplayWidth =
                r.staff!.system.staves.length > 1 ? r.bar.masterBar.displayWidth : r.bar.displayWidth;
            // Fall back to natural width so `scaleToWidth` still runs.
            r.scaleToWidth(barDisplayWidth > 0 ? barDisplayWidth : r.width);
            const w = r.x + r.width;
            if (w > result.width) {
                result.width = w;
            }
        }
    }

    /** Historical edge-to-edge placement, kept for {@link SystemsLayoutMode.UseModelLayout}. */
    private _tileBars(results: MasterBarsRenderers[]) {
        let x = 0;
        for (const result of results) {
            for (const r of result.renderers) {
                r.x = x;
            }
            x += result.width;
        }
    }

    /**
     * Alles, was links der ersten Note eines Takts steht: Taktstrich, Taktzahl, Schluessel,
     * Vorzeichen, Taktart - plus die Vorfeder der ersten Note. Genau dieser Betrag muss abgezogen
     * werden, wenn ein Takt an seiner ersten Note statt an seiner Kante verankert wird.
     */
    private _headWidth(result: MasterBarsRenderers): number {
        let preBeat = 0;
        for (const r of result.renderers) {
            if (r.preBeatGlyphsWidth > preBeat) {
                preBeat = r.preBeatGlyphsWidth;
            }
        }
        return preBeat + result.layoutingInfo.firstSpringPreSpringWidth;
    }

    /** Alles, was rechts der letzten Note eines Takts steht und vor dem naechsten Kopf liegt. */
    private _tailWidth(result: MasterBarsRenderers): number {
        let postBeat = 0;
        for (const r of result.renderers) {
            if (r.postBeatGlyphsWidth > postBeat) {
                postBeat = r.postBeatGlyphsWidth;
            }
        }
        const info = result.layoutingInfo;
        return info.lastSpringPostSpringWidth + info.incompleteGraceRodsWidth + postBeat;
    }

    /**
     * Eine Streckkraft fuer den ganzen Streifen.
     *
     * Zwei Gruende, warum die Kraft nicht je Takt bestimmt werden darf:
     *
     * 1. `force = max(stretchForce, minStretchForce)` je Takt laesst einen dichten Takt weiter
     *    auseinandergehen als seinen duennen Nachbarn. Der Cursor wird an der Naht schneller oder
     *    langsamer, obwohl die Musik gleichmaessig laeuft.
     * 2. Der Kopf des Folgetakts (Taktstrich, Taktzahl, Schluessel) ist eine feste Breite, die
     *    bisher *zusaetzlich* zwischen die letzte Note und die erste Note des naechsten Takts
     *    gelegt wurde. Gemessen waren das 18,76 Einheiten je Taktgrenze, also 9,0 % mehr Abstand
     *    ueber den Taktstrich als innerhalb des Takts (#389/#390).
     *
     * Die Antwort auf 2. ist nicht, den Kopf schmaler zu machen, sondern den Streifen so weit zu
     * dehnen, dass er in die Restzeit der letzten Note passt: die Zuteilung der letzten Feder ist
     * `force / k`, und sie muss `letzte Note + Schluss des Takts + Kopf des Folgetakts` tragen.
     */
    private _resolveUniformStretchForce(results: MasterBarsRenderers[]): number {
        let force = this.renderer.settings.display.stretchForce;

        for (const result of results) {
            const minStretchForce = result.layoutingInfo.minStretchForce;
            if (minStretchForce > force) {
                force = minStretchForce;
            }
        }

        for (let i = 0; i < results.length - 1; i++) {
            const info = results[i].layoutingInfo;
            if (!info.hasSprings || info.lastSpringConstant <= 0) {
                continue;
            }

            const required = this._tailWidth(results[i]) + this._headWidth(results[i + 1]);
            const requiredForce = required * info.lastSpringConstant;
            if (requiredForce > force) {
                force = requiredForce;
            }
        }

        return force;
    }

    /**
     * Setzt jeden Takt an seine Zeit statt an die Kante seines Vorgaengers.
     *
     * `Bar.displayWidth` wird hier bewusst ignoriert: der Endlosstreifen ist eine Zeitachse, und
     * eine je Takt vorgegebene Breite waere genau die Ungleichmaessigkeit, die diese Schicht
     * beseitigt. In der Seitenansicht bleibt `displayWidth` unveraendert wirksam.
     */
    private _layOutTimeProportionally(results: MasterBarsRenderers[], force: number): void {
        if (results.length === 0) {
            return;
        }

        // Heads and spring spans do not depend on the force being applied, so both can be known
        // before the first bar is laid out - which is what the advance of bar i needs from bar i+1.
        const heads: number[] = [];
        const spans: number[] = [];
        for (const result of results) {
            heads.push(this._headWidth(result));
            spans.push(result.layoutingInfo.springSpan(force));
        }

        // Der Kopf eines Takts greift jetzt in die Restzeit der letzten Note des Vorgaengers
        // zurueck, statt oben draufgelegt zu werden - `_resolveUniformStretchForce` hat dafuer
        // gesorgt, dass diese Restzeit lang genug ist. Dadurch ueberlappen sich die Renderbreiten
        // benachbarter Takte um genau diesen Kopf; das ist gewollt und der Grund, warum
        // `_alignRenderers` nicht mehr nachkacheln darf.
        let firstOnTimeX = heads[0];
        for (let i = 0; i < results.length; i++) {
            const result = results[i];
            const x = firstOnTimeX - heads[i];
            const isLast = i === results.length - 1;
            // Der Vorschub ist der Abstand bis zur Kante des Folgetakts. Der letzte Takt behaelt
            // seine volle Renderbreite, damit der Schlussstrich innerhalb des Streifens liegt.
            const advance = isLast ? -1 : firstOnTimeX + spans[i] - heads[i + 1] - x;

            let width = 0;
            for (const r of result.renderers) {
                r.scaleToForce(force, advance);
                r.x = x;
                if (r.width > width) {
                    width = r.width;
                }
            }

            result.width = width;
            firstOnTimeX += spans[i];
        }
    }

    private _completePartial(
        partials: HorizontalScreenLayoutPartialInfo[],
        currentPartial: HorizontalScreenLayoutPartialInfo
    ) {
        if (partials.length === 0) {
            // respect accolade and on first partial
            currentPartial.width += this._system!.accoladeWidth + this.pagePadding![0];
        }

        partials.push(currentPartial);
        Logger.debug(
            this.name,
            `Finished partial from bar ${currentPartial.masterBars[0].index} to ${currentPartial.masterBars[currentPartial.masterBars.length - 1].index}`,
            null
        );

        // start new partial
        const newPartial = new HorizontalScreenLayoutPartialInfo();
        newPartial.x = currentPartial.x + currentPartial.width;
        return newPartial;
    }

    private _finalizeStaffSystem() {
        this._alignRenderers();
        this._system!.finalizeSystem();
    }

    private _alignRenderers(): void {
        this.width = 0;
        const system = this._system!;
        // `_layOutTimeProportionally` hat jeden Renderer bereits auf seinen Zeitanker gesetzt und
        // die Takte dabei absichtlich um ihren Kopf ueberlappen lassen. Erneutes Kacheln nach
        // `renderer.width` wuerde genau die Taktstrich-Luecke wieder einfuegen, die diese Schicht
        // entfernt (#390). Hier wird deshalb nur noch die Systembreite aufgesammelt.
        // supportsResize=false ⇒ fresh StaffSystem per render, no shared-layout-data reset.
        let right = 0;
        for (const s of system.allStaves) {
            for (const renderer of s.barRenderers) {
                const rendererRight = renderer.x + renderer.width;
                if (rendererRight > right) {
                    right = rendererRight;
                }
            }
        }
        system.width = right + system.accoladeWidth;
    }
}
