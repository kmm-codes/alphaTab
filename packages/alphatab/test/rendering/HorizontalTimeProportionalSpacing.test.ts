import { ScoreLoader } from '@coderline/alphatab/importer/ScoreLoader';
import { LayoutMode } from '@coderline/alphatab/LayoutMode';
import { ScoreRenderer } from '@coderline/alphatab/rendering/ScoreRenderer';
import { Settings } from '@coderline/alphatab/Settings';
import { VisualTestHelper } from 'test/visualTests/VisualTestHelper';
import { describe, expect, it } from 'vitest';

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
 */
describe('HorizontalTimeProportionalSpacing', () => {
    interface Sample {
        tick: number;
        x: number;
        barIndex: number;
    }

    interface Step {
        slope: number;
        crossesBarLine: boolean;
        fromTick: number;
    }

    interface Measurement {
        steps: Step[];
        within: number[];
        across: number[];
        minSlope: number;
        maxSlope: number;
    }

    async function measure(
        tex: string,
        spacingRatio: number = 2,
        stretchForce: number | undefined = undefined
    ): Promise<Measurement> {
        await VisualTestHelper.prepareAlphaSkia();
        const settings = new Settings();
        VisualTestHelper.prepareSettingsForTest(settings);
        settings.core.includeNoteBounds = true;
        settings.display.layoutMode = LayoutMode.Horizontal;
        settings.display.spacingRatio = spacingRatio;
        if (stretchForce !== undefined) {
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

        // One sample per tick: several staves/voices sound the same moment and must share an x.
        const byTick = new Map<number, Sample>();
        for (const masterBar of renderer.boundsLookup!.staffSystems[0].bars) {
            for (const bar of masterBar.bars) {
                for (const beat of bar.beats) {
                    const tick = beat.beat.absoluteDisplayStart;
                    const existing = byTick.get(tick);
                    if (existing === undefined) {
                        byTick.set(tick, {
                            tick,
                            x: beat.onNotesX,
                            barIndex: bar.bar.index
                        });
                    } else {
                        expect(Math.abs(existing.x - beat.onNotesX)).toBeLessThan(0.001);
                    }
                }
            }
        }
        renderer.destroy();

        const samples = Array.from(byTick.values()).sort((a, b) => a.tick - b.tick);
        const steps: Step[] = [];
        for (let i = 1; i < samples.length; i++) {
            const previous = samples[i - 1];
            const current = samples[i];
            steps.push({
                slope: (current.x - previous.x) / (current.tick - previous.tick),
                crossesBarLine: current.barIndex !== previous.barIndex,
                fromTick: previous.tick
            });
        }

        const within = steps.filter(s => !s.crossesBarLine).map(s => s.slope);
        const across = steps.filter(s => s.crossesBarLine).map(s => s.slope);
        return {
            steps,
            within,
            across,
            minSlope: Math.min(...steps.map(s => s.slope)),
            maxSlope: Math.max(...steps.map(s => s.slope))
        };
    }

    const mean = (values: number[]) => values.reduce((a, b) => a + b, 0) / values.length;

    /**
     * The banal case first: four quarters per bar, one voice, nothing else on the page. This is
     * the picture the developer sent on 08.09.2026 - the gap from the last quarter of a bar to the
     * first quarter of the next was visibly wider than the gaps inside the bar.
     */
    it('gives one tick the same width inside a bar and across a bar line', async () => {
        const m = await measure('\\track "pno." :4 C4 D4 E4 F4 | G4 A4 B4 C5 | C5 B4 A4 G4 | F4 E4 D4 C4 |');

        expect(m.within.length).toBe(12);
        expect(m.across.length).toBe(3);

        const ratio = mean(m.across) / mean(m.within);
        console.log(
            `[#390] uniform quarters: within=${mean(m.within).toFixed(6)} across=${mean(m.across).toFixed(6)} ` +
                `ratio=${ratio.toFixed(6)} spread=${(m.maxSlope / m.minSlope).toFixed(6)}`
        );

        expect(ratio).toBeCloseTo(1, 5);
        expect(m.maxSlope / m.minSlope).toBeCloseTo(1, 5);
    });

    /**
     * Mixed durations in one voice: the spring chain now has to hold whole, half, quarter and
     * eighth notes on the same slope. A bar whose shortest note is an eighth used to be able to
     * stretch differently from its all-quarter neighbour because each bar resolved its own force.
     */
    it('keeps the slope when bars differ in note density', async () => {
        const m = await measure('\\track "pno." :1 C4 | :2 D4 E4 | :4 F4 G4 A4 B4 | :8 C5 B4 A4 G4 F4 E4 D4 C4 |');

        const ratio = mean(m.across) / mean(m.within);
        console.log(
            `[#390] mixed durations: within=${mean(m.within).toFixed(6)} across=${mean(m.across).toFixed(6)} ` +
                `ratio=${ratio.toFixed(6)} spread=${(m.maxSlope / m.minSlope).toFixed(6)}`
        );

        expect(ratio).toBeCloseTo(1, 5);
        expect(m.maxSlope / m.minSlope).toBeCloseTo(1, 5);
    });

    /**
     * Two voices, a held note against a faster one - the shape of "Haeschen in der Grube", which
     * is where the developer reported the marker speeding up after the count-in.
     */
    it('keeps the slope with a held voice against a faster one', async () => {
        const m = await measure(
            '\\track "pno." ' +
                '\\staff{score} \\tuning piano \\instrument acousticgrandpiano ' +
                ':4 C4 D4 E4 F4 | G4 F4 E4 D4 | C4 D4 E4 F4 | :2 G4 C4 |' +
                '\\staff{score} \\tuning piano \\clef F4 ' +
                ':2 C3 C3 | :2 G2 G2 | :2 C3 C3 | :1 C3 |'
        );

        const ratio = mean(m.across) / mean(m.within);
        console.log(
            `[#390] two voices: within=${mean(m.within).toFixed(6)} across=${mean(m.across).toFixed(6)} ` +
                `ratio=${ratio.toFixed(6)} spread=${(m.maxSlope / m.minSlope).toFixed(6)}`
        );

        expect(ratio).toBeCloseTo(1, 5);
        expect(m.maxSlope / m.minSlope).toBeCloseTo(1, 5);
    });

    /**
     * The head of a bar has to fit into the trailing time of the previous bar's last note. When it
     * does not, the strip is stretched until it does - it is never allowed to buy the space by
     * making one gap wider than the others. This is the developer's rule from 08.09.2026 - "wenn
     * zeichen platz brauchen, dann ist die antwort eben dass das sheet soweit gedehnt werden muss,
     * damit diese auch platz finden" - stated as a number.
     *
     * Starving the stretch force is the controlled way to force that situation: at `0.02` a
     * quarter is worth about 4 du, far too little to hold a bar line, a bar number and the next
     * note's own pre-spring. The layout has to raise the force for the whole strip, and the
     * resulting slope has to still be one single number.
     */
    it('stretches the whole strip rather than widening one gap when a head needs room', async () => {
        const tex = '\\track "pno." :4 C4 D4 E4 F4 | G4 A4 B4 C5 | C5 B4 A4 G4 |';
        const roomy = await measure(tex);
        const starved = await measure(tex, 2, 0.02);

        const starvedRatio = mean(starved.across) / mean(starved.within);
        console.log(
            `[#390] starved force: roomySlope=${mean(roomy.within).toFixed(6)} ` +
                `starvedSlope=${mean(starved.within).toFixed(6)} ratio=${starvedRatio.toFixed(6)} ` +
                `spread=${(starved.maxSlope / starved.minSlope).toFixed(6)}`
        );

        expect(starvedRatio).toBeCloseTo(1, 5);
        expect(starved.maxSlope / starved.minSlope).toBeCloseTo(1, 5);
        // 0.02 would have given ~0.00433 du/tick; the layout refused to squeeze the heads in and
        // stretched the sheet instead.
        expect(mean(starved.within)).toBeGreaterThan(0.02 * 6.5 / 30);
    });
});
