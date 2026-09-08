import { ScoreLoader } from '@coderline/alphatab/importer/ScoreLoader';
import { LayoutMode } from '@coderline/alphatab/LayoutMode';
import { Logger } from '@coderline/alphatab/Logger';
import { ScoreRenderer } from '@coderline/alphatab/rendering/ScoreRenderer';
import { Settings } from '@coderline/alphatab/Settings';
import { VisualTestHelper } from 'test/visualTests/VisualTestHelper';
import { describe, expect, it } from 'vitest';

/**
 * One sampled moment of the strip: the tick a beat sounds at, the x the cursor belongs on at that
 * moment, and which bar it came from.
 * @internal
 */
class Sample {
    public tick: number;
    public x: number;
    public barIndex: number;

    public constructor(tick: number, x: number, barIndex: number) {
        this.tick = tick;
        this.x = x;
        this.barIndex = barIndex;
    }
}

/**
 * The measured strip: one slope per adjacent pair of sampled moments, plus the two aggregates the
 * acceptance is stated in.
 * @internal
 */
class Measurement {
    public within: number[] = [];
    public across: number[] = [];
    public minSlope: number = 0;
    public maxSlope: number = 0;

    /** Ratio of the mean slope across a bar line to the mean slope inside a bar. Has to be 1. */
    public get barLineRatio(): number {
        return Measurement.mean(this.across) / Measurement.mean(this.within);
    }

    /** Fastest slope over slowest slope anywhere on the strip. Has to be 1. */
    public get spread(): number {
        return this.maxSlope / this.minSlope;
    }

    public static mean(values: number[]): number {
        let sum = 0;
        for (const v of values) {
            sum += v;
        }
        return sum / values.length;
    }
}

/**
 * The endless strip is a time axis: the position marker rides it at a constant speed, so one tick
 * has to be worth the same distance everywhere on the strip. What the reader notices when it is
 * not, is the marker speeding up or slowing down - and the loudest offender used to be the bar
 * line, where the fixed head of the next bar (bar line, bar number, clef) was added *on top of*
 * the time allocation instead of fitting inside it (#389 / #390).
 *
 * These tests measure the property directly: `BeatBounds.onNotesX` is documented as "where the
 * cursor should be at the time when this beat is played", so `dx/dt` between consecutive beats is
 * the marker's speed. Uniform speed means every one of those quotients is the same number.
 *
 * Measured on the unfixed state on 08.09.2026, at `spacingRatio = 2` and width 1152:
 *
 *   uniform quarters   barLineRatio 1.090193   spread 1.090297
 *   mixed durations    barLineRatio 0.889852   spread 2.041116
 *   two voices         barLineRatio 1.093879   spread 1.101664
 *   starved force      barLineRatio 2.169509   spread 2.171500
 *
 * The 2.04 is the one the developer felt: the marker moved twice as fast over one stretch of the
 * piece as over another.
 */
describe('HorizontalTimeProportionalSpacing', () => {
    async function measure(tex: string, spacingRatio: number = 2, stretchForce: number = -1): Promise<Measurement> {
        await VisualTestHelper.prepareAlphaSkia();
        const settings = new Settings();
        VisualTestHelper.prepareSettingsForTest(settings);
        settings.core.includeNoteBounds = true;
        settings.display.layoutMode = LayoutMode.Horizontal;
        settings.display.spacingRatio = spacingRatio;
        if (stretchForce >= 0) {
            settings.display.stretchForce = stretchForce;
        }

        const score = ScoreLoader.loadAlphaTex(tex, settings);
        const renderer = new ScoreRenderer(settings);
        renderer.width = 1152;

        let renderError: Error | null = null;
        renderer.error.on(error => {
            renderError = error;
        });
        renderer.renderScore(score, [0]);
        renderError = renderError as Error | null;
        if (renderError !== null) {
            throw renderError;
        }

        // One sample per tick: several staves and voices sound the same moment and must share an x.
        const byTick: Map<number, Sample> = new Map<number, Sample>();
        for (const masterBar of renderer.boundsLookup!.staffSystems[0].bars) {
            for (const bar of masterBar.bars) {
                for (const beat of bar.beats) {
                    const tick = beat.beat.absoluteDisplayStart;
                    if (byTick.has(tick)) {
                        expect(Math.abs(byTick.get(tick)!.x - beat.onNotesX)).toBeLessThan(0.001);
                    } else {
                        byTick.set(tick, new Sample(tick, beat.onNotesX, bar.bar.index));
                    }
                }
            }
        }
        renderer.destroy();

        const samples: Sample[] = [];
        for (const sample of byTick.values()) {
            samples.push(sample);
        }
        samples.sort((a, b) => a.tick - b.tick);

        const measurement = new Measurement();
        for (let i = 1; i < samples.length; i++) {
            const previous = samples[i - 1];
            const current = samples[i];
            const slope = (current.x - previous.x) / (current.tick - previous.tick);
            if (current.barIndex !== previous.barIndex) {
                measurement.across.push(slope);
            } else {
                measurement.within.push(slope);
            }
            if (i === 1 || slope < measurement.minSlope) {
                measurement.minSlope = slope;
            }
            if (i === 1 || slope > measurement.maxSlope) {
                measurement.maxSlope = slope;
            }
        }
        return measurement;
    }

    function report(label: string, m: Measurement): void {
        Logger.info(
            '#390',
            `${label}: within=${Measurement.mean(m.within).toFixed(6)} ` +
                `across=${Measurement.mean(m.across).toFixed(6)} ` +
                `barLineRatio=${m.barLineRatio.toFixed(6)} spread=${m.spread.toFixed(6)}`
        );
    }

    /**
     * The banal case first: four quarters per bar, one voice, nothing else on the page. This is the
     * picture the developer sent on 08.09.2026 - the gap from the last quarter of a bar to the
     * first quarter of the next was visibly wider than the gaps inside the bar.
     */
    it('gives one tick the same width inside a bar and across a bar line', async () => {
        const m = await measure('\\track "pno." :4 C4 D4 E4 F4 | G4 A4 B4 C5 | C5 B4 A4 G4 | F4 E4 D4 C4 |');
        report('uniform quarters', m);

        expect(m.within.length).toBe(12);
        expect(m.across.length).toBe(3);
        expect(m.barLineRatio).toBeCloseTo(1, 5);
        expect(m.spread).toBeCloseTo(1, 5);
    });

    /**
     * Mixed durations in one voice: the spring chain has to hold whole, half, quarter and eighth
     * notes on the same slope. A bar whose shortest note is an eighth used to be able to stretch
     * differently from its all-quarter neighbour because each bar resolved its own force.
     */
    it('keeps the slope when bars differ in note density', async () => {
        const m = await measure('\\track "pno." :1 C4 | :2 D4 E4 | :4 F4 G4 A4 B4 | :8 C5 B4 A4 G4 F4 E4 D4 C4 |');
        report('mixed durations', m);

        expect(m.barLineRatio).toBeCloseTo(1, 5);
        expect(m.spread).toBeCloseTo(1, 5);
    });

    /**
     * Two staves, a held voice against a faster one - the shape of "Haeschen in der Grube", where
     * the developer reported the marker speeding up after the count-in.
     */
    it('keeps the slope with a held voice against a faster one', async () => {
        const m = await measure(
            '\\track "pno." ' +
                '\\staff{score} \\tuning piano \\instrument acousticgrandpiano ' +
                ':4 C4 D4 E4 F4 | G4 F4 E4 D4 | C4 D4 E4 F4 | :2 G4 C4 |' +
                '\\staff{score} \\tuning piano \\clef F4 ' +
                ':2 C3 C3 | :2 G2 G2 | :2 C3 C3 | :1 C3 |'
        );
        report('two voices', m);

        expect(m.barLineRatio).toBeCloseTo(1, 5);
        expect(m.spread).toBeCloseTo(1, 5);
    });

    /**
     * The head of a bar has to fit into the trailing time of the previous bar's last note. When it
     * does not, the strip is stretched until it does - it is never allowed to buy the space by
     * making one gap wider than the others. This is the developer's rule from 08.09.2026 - "wenn
     * zeichen platz brauchen, dann ist die antwort eben dass das sheet soweit gedehnt werden muss,
     * damit diese auch platz finden" - stated as a number.
     *
     * Starving the stretch force is the controlled way to force that situation: at `0.02` a quarter
     * would be worth 0.004333 du per tick, far too little to hold a bar line, a bar number and the
     * next note's own pre-spring.
     */
    it('stretches the whole strip rather than widening one gap when a head needs room', async () => {
        const tex = '\\track "pno." :4 C4 D4 E4 F4 | G4 A4 B4 C5 | C5 B4 A4 G4 |';
        const roomy = await measure(tex);
        const starved = await measure(tex, 2, 0.02);
        report('roomy force', roomy);
        report('starved force', starved);

        expect(starved.barLineRatio).toBeCloseTo(1, 5);
        expect(starved.spread).toBeCloseTo(1, 5);
        // the layout refused to squeeze the heads in and stretched the sheet instead
        expect(Measurement.mean(starved.within)).toBeGreaterThan((0.02 * 6.5) / 30);
    });
});
