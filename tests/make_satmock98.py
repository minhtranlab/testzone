#!/usr/bin/env python3
"""Mock SAT form for the harness (98 q, own made-up content — NOT from any real or third-party test)."""
import json, os, random, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'tools'))
from make_sat_profiles import profile
from PIL import Image, ImageDraw, ImageFont
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, 'fixtures', 'satmock98')
R = random.Random(7)
FONT = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 26) if os.path.exists('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf') else ImageFont.load_default()

def bar_png(path):
    im = Image.new('RGB', (900, 520), 'white'); d = ImageDraw.Draw(im)
    d.line((90, 440, 860, 440), fill='black', width=3); d.line((90, 40, 90, 440), fill='black', width=3)
    vals = [120, 260, 190, 330]; names = ['2019', '2020', '2021', '2022']
    for i, v in enumerate(vals):
        x = 160 + i * 175; d.rectangle((x, 440 - v, x + 90, 440), fill=(90, 90, 90)); d.text((x + 12, 452), names[i], fill='black', font=FONT)
    for t in range(0, 401, 100): d.text((20, 430 - t), str(t), fill='black', font=FONT); d.line((84, 440 - t, 96, 440 - t), fill='black', width=2)
    im.save(path, dpi=(200, 200))

def tri_png(path):
    im = Image.new('RGB', (700, 460), 'white'); d = ImageDraw.Draw(im)
    d.polygon([(80, 400), (620, 400), (80, 60)], outline='black', width=4)
    d.rectangle((80, 360, 120, 400), outline='black', width=3)
    d.text((40, 220), '9', fill='black', font=FONT); d.text((340, 412), '12', fill='black', font=FONT); d.text((360, 200), 'x', fill='black', font=FONT)
    im.save(path, dpi=(200, 200))

bar_png(os.path.join(OUT, 'figures', 'MOCK-SAT98-RW1-12_f1.png'))
tri_png(os.path.join(OUT, 'figures', 'MOCK-SAT98-M1-07_f1.png'))

RW_SK = [('INI', 'INI.CID', 'Central Ideas and Details'), ('INI', 'INI.COE-T', 'Command of Evidence: Textual'),
         ('INI', 'INI.COE-Q', 'Command of Evidence: Quantitative'), ('INI', 'INI.INF', 'Inferences'),
         ('CAS', 'CAS.WIC', 'Words in Context'), ('CAS', 'CAS.TSP', 'Text Structure and Purpose'), ('CAS', 'CAS.CTC', 'Cross-Text Connections'),
         ('EOI', 'EOI.SYN', 'Rhetorical Synthesis'), ('EOI', 'EOI.TRA', 'Transitions'),
         ('SEC', 'SEC.BOU', 'Boundaries'), ('SEC', 'SEC.FSS', 'Form, Structure, and Sense')]
# SAT module order: CAS → INI → SEC → EOI (roughly)
ORDER = [4, 4, 4, 4, 5, 5, 6, 0, 0, 1, 1, 2, 2, 3, 3, 9, 9, 9, 10, 10, 10, 8, 8, 8, 7, 7, 7]
M_SK = [('H', 'H.A', 'Linear equations in one variable'), ('H', 'H.B', 'Linear functions'), ('H', 'H.C', 'Linear equations in two variables'),
        ('H', 'H.D', 'Systems of two linear equations in two variables'), ('H', 'H.E', 'Linear inequalities in one or two variables'),
        ('P', 'P.A', 'Equivalent expressions'), ('P', 'P.B', 'Nonlinear equations in one variable and systems of equations in two variables'),
        ('P', 'P.C', 'Nonlinear functions'), ('Q', 'Q.A', 'Ratios, rates, proportional relationships, and units'), ('Q', 'Q.B', 'Percentages'),
        ('Q', 'Q.C', 'One-variable data: distributions and measures of center and spread'), ('Q', 'Q.D', 'Two-variable data: models and scatterplots'),
        ('Q', 'Q.E', 'Probability and conditional probability'), ('S', 'S.A', 'Area and volume'), ('S', 'S.B', 'Lines, angles, and triangles'),
        ('S', 'S.C', 'Right triangles and trigonometry'), ('S', 'S.D', 'Circles')]
WORDS = ['careful', 'novel', 'durable', 'tentative', 'vivid', 'modest', 'rigorous', 'scarce', 'subtle', 'robust', 'candid', 'brisk']
TOPICS = ['tidal marshes', 'urban beekeeping', 'early printing presses', 'glacier melt', 'coral spawning', 'river ferries',
          'desert lichens', 'radio astronomy', 'paper money', 'bird migration', 'library design', 'salt harvesting']

def rw_q(part, i, sk):
    dom, code, name = sk; t = R.choice(TOPICS); w = R.sample(WORDS, 4)
    q = {'type': 'mcq', 'figures': []}
    if code == 'INI.COE-Q' and part == 'RW1' and i == 12:
        q['passage_html'] = ('<p>A city council report tracked the number of rooftop gardens registered in the city each year. '
                             'The council argued that a grant program started in 2020 helped increase registrations.</p>')
        q['figures'] = [{'file': 'figures/MOCK-SAT98-RW1-12_f1.png', 'alt': 'bar graph of rooftop gardens registered per year, 2019–2022', 'position': 'before_stem'}]
        q['stem_html'] = 'Which choice most effectively uses data from the graph to support the council’s argument?'
    elif code == 'INI.COE-Q':
        q['passage_html'] = ('<table class="tz-table"><tr><th>Site</th><th>Plants per m²</th><th>Soil moisture (%)</th></tr>'
                             '<tr><td>North</td><td>14</td><td>22</td></tr><tr><td>South</td><td>31</td><td>38</td></tr>'
                             '<tr><td>East</td><td>9</td><td>17</td></tr></table><p>A student studying ' + t + ' claims that plant density rises with soil moisture.</p>')
        q['stem_html'] = 'Which choice best describes data from the table that support the student’s claim?'
    elif code == 'CAS.CTC':
        q['passage_html'] = ('<p><b>Text 1</b></p><p>Some historians argue that ' + t + ' changed slowly because local workers resisted new methods.</p>'
                             '<p><b>Text 2</b></p><p>Recent records suggest the opposite: workers adopted new methods quickly whenever the cost of tools fell.</p>')
        q['stem_html'] = 'Based on the texts, how would the author of Text 2 most likely respond to the historians in Text 1?'
    elif code == 'EOI.SYN':
        q['passage_html'] = ('<p>While researching a topic, a student has taken the following notes:</p><ul>'
                             '<li>Researchers studied ' + t + ' for six years.</li><li>They recorded changes every spring.</li>'
                             '<li>The changes were largest near the coast.</li><li>The team published its results in 2024.</li></ul>')
        q['stem_html'] = 'The student wants to emphasize where the changes were largest. Which choice most effectively uses relevant information from the notes to accomplish this goal?'
    elif dom == 'SEC':
        q['passage_html'] = ('<p>Studies of ' + t + ' have long puzzled scientists. In 2023, a team of researchers ______ a new way to measure the changes over a full year.</p>')
        q['stem_html'] = 'Which choice completes the text so that it conforms to the conventions of Standard English?'
    elif code == 'CAS.WIC' and i == 3:
        q['passage_html'] = ('<p>The following text is from a poem written in the early 1900s.</p><p class="poem">Over the hill the evening comes,<br>'
                             'slow as a cart on a ______ road,<br>and every window, one by one,<br>takes up its lamp and its quiet load.</p>')
        q['stem_html'] = 'Which choice completes the text with the most logical and precise word or phrase?'
    else:
        q['passage_html'] = ('<p>Writers on ' + t + ' often describe it in broad terms, but a closer look shows a more ______ picture: '
                             'small local differences explain most of what observers report, and the larger pattern appears only over many decades.</p>')
        q['stem_html'] = R.choice(['Which choice completes the text with the most logical and precise word or phrase?',
                                   'Which choice best states the main idea of the text?', 'Which choice best describes the function of the underlined sentence?',
                                   'Which choice most logically completes the text?'])
    q['choices'] = [{'label': L, 'html': w[k] if dom in ('CAS',) and code == 'CAS.WIC' else 'It shows that ' + t + ' depends on ' + w[k] + ' local conditions.'}
                    for k, L in enumerate('ABCD')]
    if dom == 'SEC':
        q['choices'] = [{'label': L, 'html': x} for L, x in zip('ABCD', ['develops', 'developed', 'have developed', 'developing'])]
    q['key'] = R.choice('ABCD')
    return q

SPR_KEYS = [['3/4', '.75', '0.75'], ['12'], ['-5'], ['2/3', '.6666', '.6667', '0.666', '0.667'], ['7/2', '3.5'], ['15'],
            ['-1/3', '-.3333', '-0.333'], ['48'], ['1/8', '.125', '0.125'], ['9'], ['0'], ['2.5', '5/2']]

def m_q(part, i, sk, spr, k):
    dom, code, name = sk
    q = {'figures': []}
    a, b = R.randint(2, 9), R.randint(3, 20)
    if part == 'M1' and i == 7:
        q.update(type='mcq', stem_html='In the right triangle shown, what is the value of \\(x\\)?',
                 figures=[{'file': 'figures/MOCK-SAT98-M1-07_f1.png', 'alt': 'right triangle with legs 9 and 12 and hypotenuse x', 'position': 'before_stem'}],
                 choices=[{'label': L, 'html': '\\(' + v + '\\)'} for L, v in zip('ABCD', ['13', '15', '17', '21'])], key='B')
        return q
    if spr:
        q.update(type='spr', choices=[], key=SPR_KEYS[k % len(SPR_KEYS)])
        q['stem_html'] = R.choice(['If \\(%dx - %d = %d\\), what is the value of \\(x\\)?' % (a, b, a * 3 - b),
                                   'The function \\(f\\) is defined by \\(f(x)=%dx^2-%d\\). What is the value of \\(f(2)\\)?' % (a, b),
                                   'A tank holds \\(%d\\) liters of water. What fraction of the tank is full after \\(%d\\) liters are used?' % (b * 4, b),
                                   '<table class="tz-table"><tr><th>\\(x\\)</th><th>\\(y\\)</th></tr><tr><td>1</td><td>%d</td></tr><tr><td>3</td><td>%d</td></tr></table>The table shows two values of a linear function. What is the slope of the line?' % (b, b + 2 * a)])
    else:
        q.update(type='mcq', key=R.choice('ABCD'))
        q['stem_html'] = R.choice(['Which expression is equivalent to \\(%d(x+%d)-%dx\\)?' % (a, b, a - 1),
                                   'The line \\(y=%dx+%d\\) is graphed in the \\(xy\\)-plane. What is the \\(y\\)-intercept?' % (a, b),
                                   'A store sells %d pens for \\$%d. At this rate, how much do %d pens cost?' % (a, b, a * 3),
                                   'What is the solution to the system \\(x+y=%d\\) and \\(x-y=%d\\)?' % (b + a, b - a)])
        q['choices'] = [{'label': L, 'html': '\\(' + v + '\\)'} for L, v in zip('ABCD', ['x+%d' % (a * b), '%dx' % a, '\\frac{%d}{%d}' % (a, b), '%d' % (a * b)])]
    return q

qs = []
for part in ('RW1', 'RW2'):
    for i in range(1, 28):
        sk = RW_SK[ORDER[i - 1]]
        q = rw_q(part, i, sk); q.update(qid='MOCK-SAT98-%s-%02d' % (part, i), part=part, display_no=i, orig_no=i, orig_module=part)
        q['key_source'] = q['key']
        q['tags'] = {'section': 'RW', 'unit': sk[0], 'topic': sk[1], 'topic_name': sk[2], 'difficulty': 'E' if part == 'RW1' and i < 10 else ('H' if part == 'RW2' else 'M'),
                     'tag_status': 'est', 'flags': []}
        qs.append(q)
k = 0
for part in ('M1', 'M2'):
    spr_idx = {5, 6, 12, 13, 19, 20} if part == 'M1' else {4, 8, 11, 17, 18, 21}
    for i in range(1, 23):
        sk = M_SK[(i * 5 + (0 if part == 'M1' else 3)) % len(M_SK)]
        spr = i in spr_idx
        q = m_q(part, i, sk, spr, k); k += 1 if spr else 0
        q.update(qid='MOCK-SAT98-%s-%02d' % (part, i), part=part, display_no=i, orig_no=i, orig_module=part, passage_html='')
        q['key_source'] = q['key'][0] if isinstance(q['key'], list) else q['key']
        q['tags'] = {'section': 'Math', 'unit': sk[0], 'topic': sk[1], 'topic_name': sk[2], 'difficulty': 'M' if part == 'M1' else 'H',
                     'tag_status': 'est', 'flags': ['dup_in_form'] if (part, i) == ('M2', 9) else []}
        qs.append(q)
bank = {'form_id': 'MOCK-SAT98', 'source_pdf': '(mock — made up for the harness)', 'questions': qs}
json.dump(bank, open(os.path.join(OUT, 'questions.json'), 'w'), indent=1, ensure_ascii=False)
p = profile('MOCK-SAT98', 'Mock Practice Test (harness)')
json.dump(p, open(os.path.join(OUT, 'profile.json'), 'w'), indent=1, ensure_ascii=False)
print(len(qs), 'questions;', sum(1 for q in qs if q['type'] == 'spr'), 'spr')
