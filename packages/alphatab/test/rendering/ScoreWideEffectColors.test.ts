/**
 * Colour sources for PlayMorePiano #1072. Web-only: the C# side is exercised by the
 * PlayMorePiano adapter tests against the generated API.
 *
 * @target web
 */
import { ScoreLoader } from '@coderline/alphatab/importer/ScoreLoader';
import { LayoutMode } from '@coderline/alphatab/LayoutMode';
import { Logger } from '@coderline/alphatab/Logger';
import { BarStyle, BarSubElement } from '@coderline/alphatab/model/Bar';
import { BeatStyle, BeatSubElement } from '@coderline/alphatab/model/Beat';
import { Color } from '@coderline/alphatab/model/Color';
import { NoteStyle, NoteSubElement } from '@coderline/alphatab/model/Note';
import type { Score } from '@coderline/alphatab/model/Score';
import { VoiceStyle, VoiceSubElement } from '@coderline/alphatab/model/Voice';
import { ScoreRenderer } from '@coderline/alphatab/rendering/ScoreRenderer';
import { Settings } from '@coderline/alphatab/Settings';
import { VisualTestHelper } from 'test/visualTests/VisualTestHelper';
import { describe, expect, it } from 'vitest';

describe('ScoreWideEffectColors', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>1</divisions><key><fifths>1</fifths></key><time><beats>3</beats><beat-type>4</beat-type></time><staves>2</staves><clef number="1"><sign>G</sign><line>2</line></clef><clef number="2"><sign>F</sign><line>4</line></clef></attributes>
      <direction placement="above"><direction-type><rehearsal>A</rehearsal></direction-type><staff>1</staff></direction>
      <direction placement="above"><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>90</per-minute></metronome></direction-type><staff>1</staff><sound tempo="90"/></direction>
      <harmony><root><root-step>G</root-step></root><kind>major</kind><staff>1</staff></harmony>
      <direction placement="below"><direction-type><dynamics><p/></dynamics></direction-type><staff>1</staff></direction>
      <note><pitch><step>D</step><octave>5</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff><notations><tied type="start"/><slur type="start" number="1"/></notations><lyric><text>Speed</text></lyric></note>
      <note><pitch><step>D</step><octave>5</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff><notations><tied type="stop"/></notations></note>
      <note><pitch><step>B</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <backup><duration>3</duration></backup>
      <note><pitch><step>G</step><octave>2</octave></pitch><duration>2</duration><voice>5</voice><type>half</type><staff>2</staff><notations><slur type="start" number="1"/></notations></note>
      <note><pitch><step>D</step><octave>3</octave></pitch><duration>1</duration><voice>5</voice><type>quarter</type><staff>2</staff><notations><slur type="stop" number="1"/></notations></note>
    </measure>
    <measure number="2">
      <note><pitch><step>A</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff><notations><slur type="stop" number="1"/></notations></note>
      <note><rest/><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <note><pitch><step>G</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <backup><duration>3</duration></backup>
      <note><pitch><step>D</step><octave>3</octave></pitch><duration>3</duration><voice>5</voice><type>half</type><dot/><staff>2</staff></note>
    </measure>
  </part>
</score-partwise>`;

    const muted = Color.fromJson('#0000FF')!;

    function mute(score: Score, staffIndex: number) {
        const staff = score.tracks[0].staves[staffIndex];
        for (const bar of staff.bars) {
            bar.style = new BarStyle();
            for (const element of [
                BarSubElement.StandardNotationStaffLine,
                BarSubElement.StandardNotationBarLines,
                BarSubElement.StandardNotationClef,
                BarSubElement.StandardNotationKeySignature,
                BarSubElement.StandardNotationTimeSignature,
                BarSubElement.StandardNotationRepeats
            ]) {
                bar.style.colors.set(element, muted);
            }
            for (const voice of bar.voices) {
                voice.style = new VoiceStyle();
                voice.style.colors.set(VoiceSubElement.Glyphs, muted);
                for (const beat of voice.beats) {
                    beat.style = new BeatStyle();
                    for (const element of [
                        BeatSubElement.Effects,
                        BeatSubElement.StandardNotationStem,
                        BeatSubElement.StandardNotationFlags,
                        BeatSubElement.StandardNotationBeams,
                        BeatSubElement.StandardNotationTuplet,
                        BeatSubElement.StandardNotationEffects,
                        BeatSubElement.StandardNotationRests
                    ]) {
                        beat.style.colors.set(element, muted);
                    }
                    for (const note of beat.notes) {
                        note.style = new NoteStyle();
                        for (const element of [
                            NoteSubElement.Effects,
                            NoteSubElement.StandardNotationNoteHead,
                            NoteSubElement.StandardNotationAccidentals,
                            NoteSubElement.StandardNotationEffects
                        ]) {
                            note.style.colors.set(element, muted);
                        }
                    }
                }
            }
        }
    }

    async function renderSvg(layoutMode: LayoutMode, barsPerRow: number): Promise<string[]> {
        await VisualTestHelper.prepareAlphaSkia();
        const settings = new Settings();
        VisualTestHelper.prepareSettingsForTest(settings);
        settings.core.engine = 'svg';
        settings.display.layoutMode = layoutMode;
        settings.display.barsPerRow = barsPerRow;
        const score = ScoreLoader.loadScoreFromBytes(new TextEncoder().encode(xml), settings);
        mute(score, 0);
        const renderer = new ScoreRenderer(settings);
        renderer.width = 1200;
        const svgs: string[] = [];
        let renderError: Error | null = null;
        renderer.error.on(error => {
            renderError = error;
        });
        renderer.partialRenderFinished.on(result => {
            svgs.push(result.renderResult as string);
        });
        renderer.renderScore(score, [0]);
        renderer.destroy();
        renderError = renderError as Error | null;
        if (renderError !== null) {
            throw renderError;
        }
        return svgs;
    }

    /** One drawn element of the SVG: its kind, its fill (absent means black) and its content. */
    class Drawn {
        public kind: string;
        public fill: string;
        public text: string;
        public x: number;
        public y: number;
        public width: number;
        public height: number;
        public constructor(kind: string, fill: string, text: string, x: number, y: number, width: number, height: number) {
            this.kind = kind;
            this.fill = fill;
            this.text = text;
            this.x = x;
            this.y = y;
            this.width = width;
            this.height = height;
        }
    }

    function parse(svg: string): Drawn[] {
        const drawn: Drawn[] = [];
        const attribute = (tag: string, name: string): string => {
            const match = new RegExp(`\\s${name}="([^"]*)"`).exec(tag);
            return match ? match[1] : '';
        };
        const elements = /<(text|rect|path)\b([^>]*?)(\/>|>([^<]*)<\/text>)/g;
        let match: RegExpExecArray | null = elements.exec(svg);
        while (match !== null) {
            const tag = match[2];
            drawn.push(
                new Drawn(
                    match[1],
                    (attribute(tag, 'fill') || '#000000').toUpperCase(),
                    match[4] ?? '',
                    Number.parseFloat(attribute(tag, 'x') || 'NaN'),
                    Number.parseFloat(attribute(tag, 'y') || 'NaN'),
                    Number.parseFloat(attribute(tag, 'width') || 'NaN'),
                    Number.parseFloat(attribute(tag, 'height') || 'NaN')
                )
            );
            match = elements.exec(svg);
        }
        return drawn;
    }

    const isMuted = (d: Drawn) => d.fill === muted.rgba.toUpperCase();
    const symbol = (code: number) => `&#${code};`;

    /**
     * The joint between treble and bass in one rendered partial: the thin rect that starts where
     * the treble's lowest staff line ends. Staff lines are the long rects one line thick; the
     * fifth distinct line from the top is the treble's lowest.
     */
    function joints(partial: Drawn[]): Drawn[] {
        const lineTops = [
            ...new Set(partial.filter(d => d.kind === 'rect' && d.width > 20 && d.height < 2).map(d => d.y))
        ].sort((a, b) => a - b);
        if (lineTops.length < 10) {
            return [];
        }
        const lowestTrebleLine = partial.find(d => d.kind === 'rect' && d.width > 20 && d.y === lineTops[4])!;
        const trebleBottom = lowestTrebleLine.y + lowestTrebleLine.height;
        return partial.filter(
            d => d.kind === 'rect' && d.width < 2 && d.height > 10 && Math.abs(d.y - trebleBottom) < 0.01
        );
    }

    for (const layout of [
        { name: 'page, one bar per system', mode: LayoutMode.Page, barsPerRow: 1 },
        { name: 'horizontal strip', mode: LayoutMode.Horizontal, barsPerRow: -1 }
    ]) {
        it(`keeps tempo, section marker and chord name out of a muted beat's colour (${layout.name})`, async () => {
            const drawn = (await renderSvg(layout.mode, layout.barsPerRow)).flatMap(parse);
            const tempoNote = drawn.filter(d => d.text === symbol(0xeca5));
            const tempoValue = drawn.filter(d => d.text.includes('= 90'));
            const marker = drawn.filter(d => d.text.includes('[A]'));
            const chord = drawn.filter(d => d.kind === 'text' && d.text === 'G');
            Logger.info(
                '#1072',
                `${layout.name}: tempo note ${tempoNote.map(d => d.fill)}, value ${tempoValue.map(d => d.fill)}, ` +
                    `marker ${marker.map(d => d.fill)}, chord ${chord.map(d => d.fill)}`
            );
            expect(tempoNote.length).toBe(1);
            expect(tempoValue.length).toBe(1);
            expect(marker.length).toBe(1);
            expect(chord.length).toBe(1);
            for (const d of [...tempoNote, ...tempoValue, ...marker, ...chord]) {
                expect(isMuted(d)).toBe(false);
            }
        });

        it(`still colours lyrics and dynamics with their muted beat (${layout.name})`, async () => {
            const drawn = (await renderSvg(layout.mode, layout.barsPerRow)).flatMap(parse);
            const lyric = drawn.filter(d => d.text === 'Speed');
            const dynamics = drawn.filter(d => d.text === symbol(0xe520));
            Logger.info('#1072', `${layout.name}: lyric ${lyric.map(d => d.fill)}, dynamics ${dynamics.map(d => d.fill)}`);
            expect(lyric.length).toBe(1);
            expect(isMuted(lyric[0])).toBe(true);
            // The importer hangs the "p" on the first beat of both staves: the treble's follows its
            // muted beat, the bass's stays in its own voice colour.
            expect(dynamics.length).toBe(2);
            expect(dynamics.filter(isMuted).length).toBe(1);
        });

        it(`draws ties and slurs in their voice's colour (${layout.name})`, async () => {
            const drawn = (await renderSvg(layout.mode, layout.barsPerRow)).flatMap(parse);
            const paths = drawn.filter(d => d.kind === 'path');
            const mutedPaths = paths.filter(isMuted);
            Logger.info('#1072', `${layout.name}: ${mutedPaths.length} of ${paths.length} filled paths muted`);
            // Treble: the tie D5-D5 and the slur D5-A4 (in the page, its continuation on the next
            // system as a third path). Bass: one slur, unstyled.
            expect(mutedPaths.length).toBe(layout.mode === LayoutMode.Page ? 3 : 2);
            expect(paths.length - mutedPaths.length).toBe(1);
        });

        it(`keeps brace and the joint between the staves unmuted (${layout.name})`, async () => {
            const partials = (await renderSvg(layout.mode, layout.barsPerRow)).map(parse);
            const braces = partials.flat().filter(d => d.text === symbol(0xe000));
            const joined = partials.flatMap(joints);
            Logger.info('#1072', `${layout.name}: braces ${braces.map(d => d.fill)}, joints ${joined.map(d => d.fill)}`);
            expect(braces.length).toBe(layout.mode === LayoutMode.Page ? 2 : 1);
            expect(joined.length).toBe(braces.length);
            for (const d of [...braces, ...joined]) {
                expect(isMuted(d)).toBe(false);
            }
        });
    }
});
