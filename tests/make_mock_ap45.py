#!/usr/bin/env python3
"""Made-up 45-question AP Calc AB form for the harness (same shape as the 2012 exam: Part A 28 q, Part B 17 q).
Stems/choices/keys are invented; unit/topic tags are copied from mockup_data.json (public CED topic list), so the
report tests (Report tab, pause, grid proof) can run in CI without any real exam content."""
import json, os
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, 'fixtures', 'mock_ap45')
qs_tags = json.load(open(os.path.join(HERE, 'mockup_data.json'), encoding='utf-8'))['real']['qs']
prof = json.load(open(os.path.join(HERE, '..', 'tools', 'profiles', 'APCAB-2012.json'), encoding='utf-8'))
prof['form_id'] = 'MOCK-AP45'; prof['title'] = 'Mock Exam 45 \u2013 Section I'
for p in prof['parts']:
    p['directions_html'] = '<p><b>Directions:</b> Mock directions for Part %s (test form, made-up questions).</p>' % p['part']
prof.pop('_note', None)
questions = []
for i, t in enumerate(qs_tags):
    a, b = 2 + i % 7, 3 + i % 5
    key = 'ABCDE'[i % 5]
    vals = {L: a * b + (k - 'ABCDE'.index(key)) for k, L in enumerate('ABCDE')}
    questions.append({
        'qid': 'MOCK-AP45-' + t['q'], 'part': t['part'], 'display_no': t['n'], 'orig_no': t['n'], 'source_page': 0,
        'stem_html': 'Mock question %s: what is \\(%d \\times %d\\)?' % (t['q'], a, b), 'figures': [],
        'choices': [{'label': L, 'html': '\\(%d\\)' % vals[L]} for L in 'ABCDE'], 'key': key,
        'tags': {'unit': t['unit'], 'topic': t['topic'], 'topic_name': t['name'], 'topic2': None, 'practice': '1',
                 'representation': 'analytic', 'difficulty': 'M', 'tag_status': 'est'},
        'transcription_notes': 'mock'})
os.makedirs(OUT, exist_ok=True)
json.dump({'form_id': 'MOCK-AP45', 'source_pdf': '(mock — made up for engine tests)', 'key_pdf': '', 'questions': questions},
          open(os.path.join(OUT, 'questions.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
json.dump(prof, open(os.path.join(OUT, 'profile.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('wrote', OUT, len(questions), 'questions')
