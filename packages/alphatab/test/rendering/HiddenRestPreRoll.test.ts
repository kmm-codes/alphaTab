import { ScoreLoader } from '@coderline/alphatab/importer/ScoreLoader';
import { LayoutMode } from '@coderline/alphatab/LayoutMode';
import { Logger } from '@coderline/alphatab/Logger';
import { ScoreRenderer } from '@coderline/alphatab/rendering/ScoreRenderer';
import { Settings } from '@coderline/alphatab/Settings';
import { VisualTestHelper } from 'test/visualTests/VisualTestHelper';
import { describe, expect, it } from 'vitest';

/**
 * One sampled beat of the strip: the tick it sounds at, the x the cursor belongs on at that
 * moment, the bar it came from, and whether it drew anything.
 * @internal
 */
class Sample {
    public tick: number;
    public x: number;
    public barIndex: number;
    public isEmpty: boolean;
    public constructor(tick: number, x: number, barIndex: number, isEmpty: boolean) {
        this.tick = tick;
        this.x = x;
        this.barIndex = barIndex;
        this.isEmpty = isEmpty;
    }
}

/**
 * A practice strip that counts the player in with an empty bar: the bar has staff lines, a clef
 * and a time signature, but no symbol, and the cursor runs through it at the same speed as
 * through the music behind it. PlayMorePiano writes that bar as a whole-measure rest with
 * `print-object="no"` (its own importer keeps the rest's time and drops its glyph), so alphaTab
 * has to treat such a rest exactly like the invisible placeholder it already builds for gaps:
 * `isEmpty`, no glyph, and a spring as wide as the rest's duration.
 *
 * The property that matters is the slope: `dx/dt` from the start of the hidden bar to the first
 * note has to be the same number as `dx/dt` between the quarters of the bar behind it.
 */
describe('HiddenRestPreRoll', () => {
    function musicXml(printObject: 'yes' | 'no', preRollBars: number = 1): string {
        const preRoll = Array.from(
            { length: preRollBars },
            (_, i) => `
    <measure number="${i + 1}">
      ${i === 0 ? '<attributes><divisions>1</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>' : ''}
      <note print-object="${printObject}"><rest measure="yes"/><duration>4</duration><voice>1</voice></note>
    </measure>`
        ).join('');
        const quarters = (number: number, steps: string[]) => `
    <measure number="${number}">
      ${steps.map(step => `<note><pitch><step>${step}</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type></note>`).join('')}
    </measure>`;
        return `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
  <part id="P1">${preRoll}${quarters(preRollBars + 1, ['C', 'D', 'E', 'F'])}${quarters(preRollBars + 2, ['G', 'A', 'B', 'C'])}
  </part>
</score-partwise>`;
    }

    async function render(xml: string): Promise<{ samples: Sample[]; barIsEmpty: boolean[] }> {
        await VisualTestHelper.prepareAlphaSkia();
        const settings = new Settings();
        VisualTestHelper.prepareSettingsForTest(settings);
        settings.core.includeNoteBounds = true;
        settings.display.layoutMode = LayoutMode.Horizontal;
        settings.display.spacingRatio = 2;
        const score = ScoreLoader.loadScoreFromBytes(new TextEncoder().encode(xml), settings);
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
        const samples: Sample[] = [];
        for (const masterBar of renderer.boundsLookup!.staffSystems[0].bars) {
            for (const bar of masterBar.bars) {
                for (const beat of bar.beats) {
                    samples.push(
                        new Sample(beat.beat.absoluteDisplayStart, beat.onNotesX, bar.bar.index, beat.beat.isEmpty)
                    );
                }
            }
        }
        renderer.destroy();
        samples.sort((a, b) => a.tick - b.tick);
        return {
            samples,
            barIsEmpty: score.tracks[0].staves[0].bars.map(bar => bar.isEmpty)
        };
    }

    function slopes(samples: Sample[]): { preRoll: number; music: number } {
        const firstNote = samples.find(s => s.barIndex > 0 && !s.isEmpty)!;
        const preRollStart = samples[0];
        const preRoll = (firstNote.x - preRollStart.x) / (firstNote.tick - preRollStart.tick);
        const music: number[] = [];
        for (let i = samples.indexOf(firstNote) + 1; i < samples.length; i++) {
            if (samples[i].barIndex === firstNote.barIndex) {
                music.push((samples[i].x - samples[i - 1].x) / (samples[i].tick - samples[i - 1].tick));
            }
        }
        let sum = 0;
        for (const m of music) {
            sum += m;
        }
        return { preRoll, music: sum / music.length };
    }

    it('reports the visible whole-measure rest as the unfixed baseline', async () => {
        const result = await render(musicXml('yes'));
        const s = slopes(result.samples);
        Logger.info(
            '#1020',
            `visible rest: preRoll=${s.preRoll.toFixed(6)} music=${s.music.toFixed(6)} ratio=${(s.preRoll / s.music).toFixed(6)} barEmpty=${result.barIsEmpty[0]}`
        );
        expect(result.barIsEmpty[0]).toBe(false);
    });

    it('sets a hidden whole-measure rest as an empty bar of full length', async () => {
        const result = await render(musicXml('no'));
        const s = slopes(result.samples);
        Logger.info(
            '#1020',
            `hidden rest: preRoll=${s.preRoll.toFixed(6)} music=${s.music.toFixed(6)} ratio=${(s.preRoll / s.music).toFixed(6)} barEmpty=${result.barIsEmpty[0]}`
        );
        expect(result.barIsEmpty[0]).toBe(true);
        expect(result.samples[0].isEmpty).toBe(true);
        expect(result.samples[0].tick).toBe(0);
        // The pre-roll bar is one 4/4 bar of time: the first note sits one bar after tick 0.
        expect(result.samples.find(sample => !sample.isEmpty)!.tick).toBe(3840);
        expect(s.preRoll / s.music).toBeCloseTo(1, 2);
    });

    /**
     * A piece that starts with a pickup: the pre-roll is shortened so that pre-roll and pickup
     * together fill one bar, and the "1" after the pickup stays a bar line. The hidden rest is
     * three quarters long, written as a measure rest with an explicit duration.
     */
    it('sets a shortened hidden rest before a pickup bar of full length', async () => {
        const xml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
  <part id="P1">
    <measure number="0" implicit="yes">
      <attributes><divisions>1</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>
      <note print-object="no"><rest measure="yes"/><duration>3</duration><voice>1</voice></note>
    </measure>
    <measure number="1" implicit="yes">
      <note><pitch><step>G</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type></note>
    </measure>
    <measure number="2">
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type></note>
      <note><pitch><step>D</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type></note>
      <note><pitch><step>E</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type></note>
      <note><pitch><step>F</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type></note>
    </measure>
  </part>
</score-partwise>`;
        const result = await render(xml);
        const pickup = result.samples.find(s => !s.isEmpty)!;
        const firstFull = result.samples.find(s => s.barIndex === 2)!;
        const preRoll = (pickup.x - result.samples[0].x) / (pickup.tick - result.samples[0].tick);
        const music =
            (result.samples[result.samples.length - 1].x - firstFull.x) /
            (result.samples[result.samples.length - 1].tick - firstFull.tick);
        Logger.info(
            '#1020',
            `pickup: preRollTicks=${pickup.tick} preRoll=${preRoll.toFixed(6)} music=${music.toFixed(6)} ratio=${(preRoll / music).toFixed(6)}`
        );
        expect(result.barIsEmpty[0]).toBe(true);
        expect(pickup.tick).toBe(2880);
        expect(firstFull.tick).toBe(3840);
        expect(preRoll / music).toBeCloseTo(1, 2);
    });

    it('keeps the slope over two hidden pre-roll bars', async () => {
        const result = await render(musicXml('no', 2));
        const s = slopes(result.samples);
        Logger.info('#1020', `two hidden bars: ratio=${(s.preRoll / s.music).toFixed(6)}`);
        expect(result.barIsEmpty[0]).toBe(true);
        expect(result.barIsEmpty[1]).toBe(true);
        expect(s.preRoll / s.music).toBeCloseTo(1, 2);
    });
});
