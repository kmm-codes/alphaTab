/**
 * Layout measurement for PlayMorePiano #1065: the pre-roll bars of a practice stage show printed
 * rests again. Web-only, like HiddenRestPreRoll.test.ts, so the C# transpiler skips it.
 *
 * @target web
 */
import { ScoreLoader } from '@coderline/alphatab/importer/ScoreLoader';
import { LayoutMode } from '@coderline/alphatab/LayoutMode';
import { Logger } from '@coderline/alphatab/Logger';
import { ScoreRenderer } from '@coderline/alphatab/rendering/ScoreRenderer';
import { Settings } from '@coderline/alphatab/Settings';
import { VisualTestHelper } from 'test/visualTests/VisualTestHelper';
import { describe, expect, it } from 'vitest';

/** @internal */
class Beat {
    public x: number;
    public barIndex: number;
    public staffIndex: number;
    public isRest: boolean;
    public isEmpty: boolean;
    public barStartX: number;
    public constructor(
        x: number,
        barIndex: number,
        staffIndex: number,
        isRest: boolean,
        isEmpty: boolean,
        barStartX: number
    ) {
        this.x = x;
        this.barIndex = barIndex;
        this.staffIndex = staffIndex;
        this.isRest = isRest;
        this.isEmpty = isEmpty;
        this.barStartX = barStartX;
    }
}

/**
 * PlayMorePiano writes each pre-roll bar as `<measure implicit="yes">` (its own bar numbering skips
 * it). Until #1065 the rests in it carried `print-object="no"` (fork pmp.12 turns them into empty
 * beats); now they are printed: a whole-measure rest per staff for a full bar, conventional rests
 * of the bar's actual length for a bar shortened before a pickup.
 *
 * Implicit bars count zero ticks in alphaTab, so the comparison is made in x against the quarter
 * width of the music: the pre-roll must span exactly its length in quarters, and the first note
 * and the music behind it must stand where they stood with hidden rests.
 */
describe('VisibleRestPreRoll', () => {
    const attributes = (beats: number, beatType: number, staves: number, divisions: number) =>
        `<attributes><divisions>${divisions}</divisions><key><fifths>0</fifths></key><time><beats>${beats}</beats><beat-type>${beatType}</beat-type></time>${staves > 1 ? `<staves>${staves}</staves>` : ''}<clef number="1"><sign>G</sign><line>2</line></clef>${staves > 1 ? '<clef number="2"><sign>F</sign><line>4</line></clef>' : ''}</attributes>`;

    /** One pre-roll bar exactly as MusicXmlPerformanceSource.PreRollMeasures writes it. */
    function preRollBar(number: number, rests: string[][], staves: number, duration: number, head: string): string {
        let body = head;
        for (let staff = 1; staff <= staves; staff++) {
            if (staff > 1) {
                body += `<backup><duration>${duration}</duration></backup>`;
            }
            body += rests[staff - 1].join('');
        }
        return `<measure number="${number}" implicit="yes">${body}</measure>`;
    }

    function measureRest(duration: number, voice: number, staff: number, staves: number, print: boolean): string {
        return `<note${print ? '' : ' print-object="no"'}><rest measure="yes"/><duration>${duration}</duration><voice>${voice}</voice>${staves > 1 ? `<staff>${staff}</staff>` : ''}</note>`;
    }

    function rest(duration: number, type: string, dots: number, voice: number): string {
        return `<note><rest/><duration>${duration}</duration><voice>${voice}</voice><type>${type}</type>${'<dot/>'.repeat(dots)}</note>`;
    }

    function note(step: string, octave: number, duration: number, type: string, dots: number, voice: number, staff: number, staves: number): string {
        return `<note><pitch><step>${step}</step><octave>${octave}</octave></pitch><duration>${duration}</duration><voice>${voice}</voice><type>${type}</type>${'<dot/>'.repeat(dots)}${staves > 1 ? `<staff>${staff}</staff>` : ''}</note>`;
    }

    function document(measures: string): string {
        return `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
  <part id="P1">${measures}</part>
</score-partwise>`;
    }

    /** 4/4, divisions 1: two pre-roll bars, then two bars of quarters (bass: whole notes). */
    function fourFour(print: boolean, staves: number): string {
        const head = attributes(4, 4, staves, 1);
        const pre = [0, 1]
            .map(bar =>
                preRollBar(
                    bar - 1,
                    [[measureRest(4, 1, 1, staves, print)], [measureRest(4, 5, 2, staves, print)]],
                    staves,
                    4,
                    bar === 0 ? head : ''
                )
            )
            .join('');
        const musicBar = (number: number, steps: string[]) => {
            let body = steps.map(step => note(step, 4, 1, 'quarter', 0, 1, 1, staves)).join('');
            if (staves > 1) {
                body += `<backup><duration>4</duration></backup>${note('C', 3, 4, 'whole', 0, 5, 2, staves)}`;
            }
            return `<measure number="${number}">${body}</measure>`;
        };
        return document(pre + musicBar(1, ['C', 'D', 'E', 'F']) + musicBar(2, ['G', 'A', 'B', 'C']));
    }

    /** 6/8, divisions 2 (eighths): two pre-roll bars, then two bars of dotted quarters. */
    function sixEight(print: boolean): string {
        const head = attributes(6, 8, 1, 2);
        const pre = [0, 1]
            .map(bar => preRollBar(bar - 1, [[measureRest(6, 1, 1, 1, print)]], 1, 6, bar === 0 ? head : ''))
            .join('');
        const musicBar = (number: number, steps: string[]) =>
            `<measure number="${number}">${steps.map(step => note(step, 4, 3, 'quarter', 1, 1, 1, 1)).join('')}</measure>`;
        return document(pre + musicBar(1, ['C', 'D']) + musicBar(2, ['E', 'F']));
    }

    async function render(xml: string): Promise<Beat[]> {
        await VisualTestHelper.prepareAlphaSkia();
        const settings = new Settings();
        VisualTestHelper.prepareSettingsForTest(settings);
        settings.core.includeNoteBounds = true;
        settings.display.layoutMode = LayoutMode.Horizontal;
        settings.display.spacingRatio = 2;
        const score = ScoreLoader.loadScoreFromBytes(new TextEncoder().encode(xml), settings);
        const renderer = new ScoreRenderer(settings);
        renderer.width = 1600;
        let renderError: Error | null = null;
        renderer.error.on(error => {
            renderError = error;
        });
        renderer.renderScore(score, [0]);
        renderError = renderError as Error | null;
        if (renderError !== null) {
            throw renderError;
        }
        const beats: Beat[] = [];
        for (const masterBar of renderer.boundsLookup!.staffSystems[0].bars) {
            for (const bar of masterBar.bars) {
                for (const beat of bar.beats) {
                    beats.push(
                        new Beat(
                            beat.onNotesX,
                            bar.bar.index,
                            bar.bar.staff.index,
                            beat.beat.isRest,
                            beat.beat.isEmpty,
                            masterBar.realBounds.x
                        )
                    );
                }
            }
        }
        renderer.destroy();
        return beats;
    }

    /**
     * quarter: quarter width in the music (first to last onset of the first music bar, top staff).
     * preRollQuarters: from the start of the first pre-roll beat to the first note, in quarters.
     */
    function measure(beats: Beat[], firstMusicBar: number, musicQuarters: number) {
        const top = beats.filter(b => b.staffIndex === 0);
        const music = top.filter(b => b.barIndex === firstMusicBar);
        const quarter = (music[music.length - 1].x - music[0].x) / musicQuarters;
        const firstPreRoll = top.find(b => b.barIndex === 0)!;
        const preRollQuarters = (music[0].x - firstPreRoll.x) / quarter;
        const preRollQuartersFromBarStart = (music[0].x - firstPreRoll.barStartX) / quarter;
        return { quarter, firstNoteX: music[0].x, preRollQuarters, preRollQuartersFromBarStart, firstPreRollX: firstPreRoll.x };
    }

    for (const staves of [1, 2]) {
        it(`keeps the 4/4 slope with printed measure rests on ${staves} staff/staves`, async () => {
            const hidden = await render(fourFour(false, staves));
            const visible = await render(fourFour(true, staves));
            const h = measure(hidden, 2, 3);
            const v = measure(visible, 2, 3);
            const printedRests = visible.filter(b => b.barIndex < 2 && b.isRest && !b.isEmpty).length;
            Logger.info(
                '#1065',
                `4/4 staves=${staves}: hidden quarter=${h.quarter.toFixed(4)} firstNote=${h.firstNoteX.toFixed(2)} preRollQ=${h.preRollQuarters.toFixed(6)} fromBar=${h.preRollQuartersFromBarStart.toFixed(6)} | visible quarter=${v.quarter.toFixed(4)} firstNote=${v.firstNoteX.toFixed(2)} preRollQ=${v.preRollQuarters.toFixed(6)} fromBar=${v.preRollQuartersFromBarStart.toFixed(6)} restX=${v.firstPreRollX.toFixed(2)} printedRests=${printedRests} ratio=${(v.preRollQuarters / 8).toFixed(6)}`
            );
            expect(printedRests).toBe(2 * staves);
            expect(v.preRollQuarters / 8).toBeCloseTo(1, 2);
            expect(Math.abs(v.quarter / h.quarter - 1)).toBeLessThan(0.01);
            // The printed rest may move the whole bar content (its glyph needs room at the bar
            // start); what must not change is the time axis: pre-roll start and first note shift by
            // the same amount.
            const shift = v.firstNoteX - h.firstNoteX;
            const startShift = v.firstPreRollX - h.firstPreRollX;
            Logger.info('#1065', `4/4 staves=${staves}: shift firstNote=${shift.toFixed(3)} preRollStart=${startShift.toFixed(3)}`);
            expect(Math.abs(shift - startShift)).toBeLessThan(0.01 * v.quarter);
        });
    }

    it('keeps the 6/8 slope with printed measure rests', async () => {
        const hidden = await render(sixEight(false));
        const visible = await render(sixEight(true));
        // Music bar 2 holds two dotted quarters: 1.5 quarters between them.
        const h = measure(hidden, 2, 1.5);
        const v = measure(visible, 2, 1.5);
        Logger.info(
            '#1065',
            `6/8: hidden quarter=${h.quarter.toFixed(4)} firstNote=${h.firstNoteX.toFixed(2)} preRollQ=${h.preRollQuarters.toFixed(6)} | visible quarter=${v.quarter.toFixed(4)} firstNote=${v.firstNoteX.toFixed(2)} preRollQ=${v.preRollQuarters.toFixed(6)} fromBar=${v.preRollQuartersFromBarStart.toFixed(6)} ratio=${(v.preRollQuarters / 6).toFixed(6)}`
        );
        expect(v.preRollQuarters / 6).toBeCloseTo(1, 2);
        expect(Math.abs(v.quarter / h.quarter - 1)).toBeLessThan(0.01);
        const shift = v.firstNoteX - h.firstNoteX;
        const startShift = v.firstPreRollX - h.firstPreRollX;
        Logger.info('#1065', `6/8: shift firstNote=${shift.toFixed(3)} preRollStart=${startShift.toFixed(3)}`);
        expect(Math.abs(shift - startShift)).toBeLessThan(0.01 * v.quarter);
    });

    /**
     * A 4/4 piece with a one-quarter pickup: the pre-roll bar is shortened to three quarters and
     * written conventionally as a half and a quarter rest, not as a measure rest.
     */
    it('spaces a shortened pre-roll of a half and a quarter rest by time', async () => {
        const head = attributes(4, 4, 1, 1);
        const xml = document(
            preRollBar(0, [[rest(2, 'half', 0, 1), rest(1, 'quarter', 0, 1)]], 1, 3, head) +
                `<measure number="1" implicit="yes">${note('G', 4, 1, 'quarter', 0, 1, 1, 1)}</measure>` +
                `<measure number="2">${['C', 'D', 'E', 'F'].map(s => note(s, 4, 1, 'quarter', 0, 1, 1, 1)).join('')}</measure>`
        );
        const beats = (await render(xml)).filter(b => b.staffIndex === 0);
        const full = beats.filter(b => b.barIndex === 2);
        const quarter = (full[full.length - 1].x - full[0].x) / 3;
        const pre = beats.filter(b => b.barIndex === 0);
        const pickup = beats.find(b => b.barIndex === 1)!;
        const halfQuarters = (pre[1].x - pre[0].x) / quarter;
        const quarterRestQuarters = (pickup.x - pre[1].x) / quarter;
        const pickupQuarters = (full[0].x - pickup.x) / quarter;
        Logger.info(
            '#1065',
            `pickup: quarter=${quarter.toFixed(4)} rests=${pre.length} half=${halfQuarters.toFixed(6)} quarterRest=${quarterRestQuarters.toFixed(6)} pickup=${pickupQuarters.toFixed(6)}`
        );
        expect(pre.length).toBe(2);
        expect(pre.every(b => b.isRest && !b.isEmpty)).toBe(true);
        expect(halfQuarters / 2).toBeCloseTo(1, 2);
        expect(quarterRestQuarters).toBeCloseTo(1, 2);
        expect(pickupQuarters).toBeCloseTo(1, 2);
    });
});
