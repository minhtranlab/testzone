#!/usr/bin/env python3
"""
Test Zone — build a form's data file for Apps Script.

  python3 tools/build_data.py "<project folder>/data/ap-calc-ab-2012"   # → dist/APCAB-2012.json (+ Data_*.gs, csv, Forms_Registry.gs)
  python3 tools/build_data.py tests/fixtures/mock --out tests/.work/gas  # mock form for the test harness

dist/ and tests/.work/ are git-ignored: their files hold questions + keys and must NEVER be committed (public repo).
Production: <form_id>.json is uploaded to the Drive folder "Test Zone - Form Files" (tools/upload_form.mjs) and
read by the script from Drive; copy dist/Forms_Registry.gs (profiles only, no questions/keys) to src/.

Reads  <form_dir>/questions.json (SPEC §3) + its figures, and the exam profile from
       <form_dir>/profile.json if present, else tools/profiles/<form_id>.json.
Writes <form_id>.json : {form_id, profile, questions} — the file that goes to Drive (production)
       Data_<ID>.gs   : function FORM_<ID>_() { return JSON.parse("…"); }  (profile + questions incl. keys; server-side only)
                        A function, not a global constant: Apps Script runs every file's top-level code on every call, so a
                        constant would parse ALL forms each time. The function is parsed only when that form is needed.
       Questions_<FORM>.csv : rows for the Sheet's Questions tab (no stem text)
       Forms_Registry.gs : getFormRegistry_() = {form_id: {profile, load}} for every Data_*.gs in the output folder
                        (profile with question counts → My Tests / Forms never parse the big data files)
Figures are embedded as base64 PNG data URIs (lossless re-encode; greyscale when the image is grey).
SAT forms (profile exam "SAT") are also checked against data/taxonomy/sat_skills.csv and for leftover watermarks.
"""
import argparse, base64, csv, io, json, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
TAXONOMY = None
QUESTION_FIELDS = ['qid', 'part', 'display_no', 'orig_no', 'orig_module', 'type', 'stem_html', 'passage_html', 'figures', 'choices', 'key',
                   'key_source', 'tags']
CSV_FIELDS = ['qid', 'form_id', 'part', 'display_no', 'orig_no', 'key', 'unit', 'topic', 'topic_name', 'topic2', 'practice',
              'representation', 'difficulty', 'tag_status', 'type', 'orig_module', 'key_source', 'flags']
SIZE_WARN_FILE = 2.5 * 1024 * 1024   # one Data_*.gs: pasting gets slow, keep it below this
SIZE_WARN_TOTAL = 8 * 1024 * 1024    # all Data_*.gs together: an Apps Script project tops out around 10 MB
WATERMARKS = re.compile(r'flash\s*sat|stewie', re.I)
SPR_RE = re.compile(r'^-?(\d+|\d*\.\d+|\d+\.|\d+/\d+)$')


def const_name(form_id):
    return 'FORM_' + re.sub(r'[^A-Za-z0-9]', '_', form_id)


def load_taxonomy(form_dir):
    for p in (os.path.join(form_dir, '..', 'taxonomy', 'sat_skills.csv'), os.path.join(HERE, '..', 'data', 'taxonomy', 'sat_skills.csv')):
        if os.path.exists(p):
            with open(p, encoding='utf-8') as fh:
                return {r['skill']: r for r in csv.DictReader(fh)}
    return None


def spr_ok(k):
    k = str(k).strip()
    return bool(SPR_RE.match(k)) and len(k) <= (6 if k.startswith('-') else 5)


def png_data_uri(path, default_dpi, scale=1.0):
    """Return (data_uri, css_width_px). Lossless: only drops alpha/colour when they carry no information."""
    try:
        from PIL import Image
    except ImportError:
        raw = open(path, 'rb').read()
        return 'data:image/png;base64,' + base64.b64encode(raw).decode(), None
    im = Image.open(path)
    dpi = default_dpi
    if im.info.get('dpi'):
        try:
            dpi = float(im.info['dpi'][0]) or default_dpi
        except Exception:
            pass
    if dpi < 100:  # PNG without real dpi metadata (often 72) → assume the render dpi
        dpi = default_dpi
    w = im.width
    if im.mode in ('RGBA', 'LA'):
        alpha = im.getchannel('A')
        if alpha.getextrema() == (255, 255):
            im = im.convert('RGB' if im.mode == 'RGBA' else 'L')
        else:  # flatten on white
            bg = Image.new('RGB', im.size, (255, 255, 255))
            bg.paste(im.convert('RGBA'), mask=alpha)
            im = bg
    if im.mode == 'P':
        im = im.convert('RGB')
    if im.mode == 'RGB':
        r, g, b = im.split()
        from PIL import ImageChops
        if ImageChops.difference(r, g).getbbox() is None and ImageChops.difference(r, b).getbbox() is None:
            im = r  # truly grey → 1 channel, identical pixels
    buf = io.BytesIO()
    im.save(buf, format='PNG', optimize=True)
    raw = buf.getvalue()
    orig = open(path, 'rb').read()
    if len(orig) < len(raw):
        raw = orig
    css_w = round(w * 96.0 / dpi * scale)
    return 'data:image/png;base64,' + base64.b64encode(raw).decode(), css_w


IMG_RE = re.compile(r'<img\b([^>]*?)\bsrc="([^"]+)"([^>]*)>', re.I)


def inline_imgs(html, form_dir, a):
    total = [0]

    def sub(m):
        pre, src, post = m.group(1), m.group(2), m.group(3)
        if src.startswith('data:') or src.startswith('http'):
            return m.group(0)
        fp = os.path.join(form_dir, src)
        if not os.path.exists(fp):
            sys.exit('inline image missing: %s' % src)
        uri, w = png_data_uri(fp, a.dpi, a.scale)
        total[0] += len(uri)
        style = '' if ('style=' in pre + post or 'width=' in pre + post or not w) else ' style="width:%dpx"' % w
        return '<img%ssrc="%s"%s%s>' % (pre if pre.endswith(' ') else pre + ' ', uri, post, style)
    return IMG_RE.sub(sub, html), total[0]


def directions_from_info(info):
    notes = ''.join('<li>%s</li>' % n for n in info.get('in_this_exam', []))
    return ('<p><b>Directions:</b> Solve each of the following problems. After examining the form of the choices, decide which is '
            'the best of the choices given and select it. Do not spend too much time on any one problem.</p>'
            + ('<p><b>%s</b></p>' % info['header'] if info.get('header') else '')
            + ('<p><b>In this exam:</b></p><ol>%s</ol>' % notes if notes else ''))


def load_profile(form_dir, form_id):
    for p in (os.path.join(form_dir, 'profile.json'), os.path.join(HERE, 'profiles', form_id + '.json')):
        if os.path.exists(p):
            return json.load(open(p, encoding='utf-8')), p
    sys.exit('No profile for %s (looked in %s/profile.json and tools/profiles/%s.json)' % (form_id, form_dir, form_id))


def validate(bank, profile, form_dir):
    errs, warns = [], []
    qs = bank.get('questions', [])
    ids = [q.get('qid') for q in qs]
    if len(ids) != len(set(ids)):
        errs.append('duplicate qid')
    parts = {p['part']: p for p in profile['parts']}
    for q in qs:
        qid = q.get('qid', '?')
        if q.get('part') not in parts:
            errs.append('%s: part %r not in profile' % (qid, q.get('part')))
            continue
        typ = q.get('type', 'mcq')
        if typ == 'mcq':
            labels = [c.get('label') for c in q.get('choices', [])]
            n = parts[q['part']].get('choices')
            if n and len(labels) != n:
                errs.append('%s: %d choices, profile expects %d' % (qid, len(labels), n))
            keys = q.get('key') if isinstance(q.get('key'), list) else [q.get('key')]
            if not keys or any(k not in labels for k in keys):
                errs.append('%s: key %r not among choices %s' % (qid, q.get('key'), labels))
        elif typ == 'spr':
            if not q.get('key'):
                errs.append('%s: spr without key' % qid)
        if not q.get('stem_html'):
            errs.append('%s: empty stem_html' % qid)
        for f in q.get('figures', []):
            fp = os.path.join(form_dir, f.get('file', ''))
            if not os.path.exists(fp):
                errs.append('%s: figure missing %s' % (qid, f.get('file')))
        t = q.get('tags') or {}
        for k in ('unit', 'topic'):
            if t.get(k) in (None, ''):
                warns.append('%s: tag %s empty' % (qid, k))
        if profile.get('exam') == 'SAT':
            if typ == 'spr':
                keys = q.get('key') if isinstance(q.get('key'), list) else [q.get('key')]
                if not keys or any(not str(k).strip() for k in keys):
                    errs.append('%s: spr key list empty' % qid)
                bad = [k for k in keys if not spr_ok(k)]
                if bad:
                    warns.append('%s: spr key(s) %s cannot be typed in the answer box (max 5 chars, 6 with "-")' % (qid, bad))
                if q.get('choices'):
                    errs.append('%s: spr question has choices' % qid)
            sec = 'RW' if q['part'].startswith('RW') else 'Math'
            if t.get('section') and t['section'] != sec:
                errs.append('%s: tags.section %s but part %s' % (qid, t['section'], q['part']))
            tax = TAXONOMY
            if tax is not None:
                row = tax.get(t.get('topic'))
                if not row:
                    errs.append('%s: skill %r not in sat_skills.csv' % (qid, t.get('topic')))
                elif row['domain'] != str(t.get('unit')) or row['section'] != sec:
                    errs.append('%s: skill %s belongs to %s/%s, tagged unit %s in %s' % (qid, t.get('topic'), row['section'], row['domain'], t.get('unit'), sec))
            blob = json.dumps(q, ensure_ascii=False)
            if WATERMARKS.search(blob.replace(q.get('qid', ''), '')):
                errs.append('%s: watermark / source name left in the question text' % qid)
            for f in q.get('figures', []):
                if WATERMARKS.search(f.get('file', '')):
                    errs.append('%s: figure file name contains a source name: %s' % (qid, f.get('file')))
    for pid, p in parts.items():
        n = sum(1 for q in qs if q.get('part') == pid)
        if p.get('n') and n != p['n']:
            warns.append('part %s: %d questions in bank, profile says %d' % (pid, n, p['n']))
        nos = sorted(q.get('display_no') for q in qs if q.get('part') == pid)
        if nos != list(range(1, n + 1)):
            warns.append('part %s: display_no not 1..%d: %s' % (pid, n, nos))
    return errs, warns


LITERAL_RE = re.compile(r'(?:const (FORM_\w+) = JSON\.parse\(|function (FORM_\w+)_\(\) \{ return JSON\.parse\()("(?:[^"\\]|\\.)*")\)', re.S)


def registry_profile(data):
    """Profile as the registry keeps it: part.n = questions in the data file."""
    prof = json.loads(json.dumps(data['profile']))
    for p in prof['parts']:
        p['n'] = sum(1 for q in data['questions'] if q['part'] == p['part'])
    prof['n_total'] = len(data['questions'])
    return prof


def write_registry(out_dir):
    entries, sizes = [], []
    for fn in sorted(os.listdir(out_dir)):
        if fn.startswith('Data_') and fn.endswith('.gs'):
            src = open(os.path.join(out_dir, fn), encoding='utf-8').read()
            m1 = re.search(r'// form_id: (\S+)', src[:600])
            m2 = LITERAL_RE.search(src)
            if not (m1 and m2):
                continue
            name = m2.group(1) or m2.group(2)
            data = json.loads(json.loads(m2.group(3)))
            entries.append((m1.group(1), name, registry_profile(data)))
            sizes.append((fn, len(src.encode('utf-8'))))
    body = ',\n'.join(
        '    %s: { profile: %s,\n      has: function () { return typeof %s_ === \'function\' || typeof %s !== \'undefined\'; },\n'
        '      load: function () { return typeof %s_ === \'function\' ? %s_() : (typeof %s !== \'undefined\' ? %s : null); } }'
        % (json.dumps(fid), json.dumps(prof, ensure_ascii=True, separators=(',', ':')), c, c, c, c, c, c)
        for fid, c, prof in entries)
    src = ('// GENERATED by build_data.py — lists every Data_*.gs file. Re-run the script after adding a form.\n'
           '// profile = exam profile with question counts (cheap); load() parses that form\'s data file only when it is needed.\n'
           '// has() = a Data_*.gs file is in the project (tests only). In production has() is false and Code.gs loads <form_id>.json from Drive.\n'
           'function getFormRegistry_() {\n  return {\n' + body + '\n  };\n}\n')
    open(os.path.join(out_dir, 'Forms_Registry.gs'), 'w', encoding='utf-8').write(src)
    return [(f, c) for f, c, _ in entries], sizes


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('form_dir')
    ap.add_argument('--out', default=os.path.join(HERE, '..', 'dist'), help='output folder (default: dist/, git-ignored)')
    ap.add_argument('--dpi', type=float, default=200, help='render dpi of figure PNGs without dpi metadata')
    ap.add_argument('--scale', type=float, default=1.35, help='screen size vs print size of figures (1 = same size as on paper)')
    a = ap.parse_args()
    global TAXONOMY
    form_dir = os.path.abspath(a.form_dir)
    TAXONOMY = load_taxonomy(form_dir)
    bank = json.load(open(os.path.join(form_dir, 'questions.json'), encoding='utf-8'))
    form_id = bank['form_id']
    profile, ppath = load_profile(form_dir, form_id)
    if profile.get('form_id') != form_id:
        sys.exit('profile form_id %s != bank form_id %s' % (profile.get('form_id'), form_id))
    errs, warns = validate(bank, profile, form_dir)
    for w in warns:
        print('WARN ', w)
    if errs:
        for e in errs:
            print('ERROR', e)
        sys.exit('%d error(s) — nothing written' % len(errs))

    out_qs, fig_bytes = [], 0
    for q in sorted(bank['questions'], key=lambda q: ([p['part'] for p in profile['parts']].index(q['part']), q['display_no'])):
        o = {k: q[k] for k in QUESTION_FIELDS if k in q}
        o.setdefault('type', 'mcq')
        figs = []
        for f in q.get('figures', []):
            uri, w = png_data_uri(os.path.join(form_dir, f['file']), a.dpi, a.scale)
            fig_bytes += len(uri)
            figs.append({'src': uri, 'alt': f.get('alt', ''), 'position': f.get('position', 'before_stem'),
                         'width': f.get('width') or w})
        o['figures'] = figs
        # <img src="figures/…"> inside stem / passage / choices (e.g. graph answer choices) → data URI + screen width
        for k in ('stem_html', 'passage_html'):
            if o.get(k):
                o[k], nb = inline_imgs(o[k], form_dir, a)
                fig_bytes += nb
        for c in o.get('choices', []):
            c['html'], nb = inline_imgs(c['html'], form_dir, a)
            fig_bytes += nb
        out_qs.append(o)
    # directions text from the bank's parts_info (Chat A transcription of the booklet notes), if present
    for p in profile['parts']:
        info = (bank.get('parts_info') or {}).get(p['part'])
        if info:
            p['directions_html'] = directions_from_info(info)
    data = {'form_id': form_id, 'profile': profile, 'questions': out_qs}

    os.makedirs(a.out, exist_ok=True)
    cname = const_name(form_id)
    literal = json.dumps(json.dumps(data, ensure_ascii=True, separators=(',', ':')))
    gs = ('// GENERATED by build_data.py from %s — do not edit by hand.\n'
          '// form_id: %s\n'
          '// Contains the answer key: server-side only (never sent to the browser).\n'
          'function %s_() { return JSON.parse(%s); }\n') % (os.path.relpath(form_dir), form_id, cname, literal)
    gs_path = os.path.join(a.out, 'Data_%s.gs' % re.sub(r'[^A-Za-z0-9]', '_', form_id))
    open(gs_path, 'w', encoding='utf-8').write(gs)
    json_path = os.path.join(a.out, '%s.json' % form_id)
    open(json_path, 'w', encoding='utf-8').write(json.dumps(data, ensure_ascii=True, separators=(',', ':')))

    csv_path = os.path.join(a.out, 'Questions_%s.csv' % form_id)
    with open(csv_path, 'w', newline='', encoding='utf-8') as fh:
        wr = csv.DictWriter(fh, fieldnames=CSV_FIELDS)
        wr.writeheader()
        for q in out_qs:
            t = q.get('tags') or {}
            wr.writerow({'qid': q['qid'], 'form_id': form_id, 'part': q['part'], 'display_no': q['display_no'],
                         'orig_no': q.get('orig_no', ''), 'key': '|'.join(q['key']) if isinstance(q['key'], list) else q['key'],
                         'unit': t.get('unit', ''), 'topic': t.get('topic', ''), 'topic_name': t.get('topic_name', ''),
                         'topic2': t.get('topic2') or '', 'practice': t.get('practice', ''),
                         'representation': t.get('representation', ''), 'difficulty': t.get('difficulty', ''),
                         'tag_status': t.get('tag_status', 'est'), 'type': q.get('type', 'mcq'),
                         'orig_module': q.get('orig_module', ''),
                         'key_source': '|'.join(q['key_source']) if isinstance(q.get('key_source'), list) else q.get('key_source', ''),
                         'flags': ','.join(t.get('flags') or [])})
    reg, sizes = write_registry(a.out)
    print('OK  %s: %d questions (%s), figures %.0f KB, %s = %.0f KB' % (
        form_id, len(out_qs), ', '.join('%s=%d' % (p['part'], sum(1 for q in out_qs if q['part'] == p['part'])) for p in profile['parts']),
        fig_bytes / 1024, os.path.basename(gs_path), os.path.getsize(gs_path) / 1024))
    print('    profile: %s' % os.path.relpath(ppath))
    print('    wrote %s, %s, %s, Forms_Registry.gs (%s)' % (os.path.basename(json_path), os.path.basename(gs_path), os.path.basename(csv_path), ', '.join(f for f, _ in reg)))
    total = sum(b for _, b in sizes)
    print('    all Data files: %.1f MB (%s)' % (total / 1048576, ', '.join('%s %.0f KB' % (f, b / 1024) for f, b in sizes)))
    if os.path.getsize(gs_path) > SIZE_WARN_FILE:
        print('WARN %s is %.1f MB (> %.1f MB): pasting into the editor gets slow; consider smaller figures (--scale)'
              % (os.path.basename(gs_path), os.path.getsize(gs_path) / 1048576, SIZE_WARN_FILE / 1048576))
    if total > SIZE_WARN_TOTAL:
        print('WARN all Data files together are %.1f MB (> %.0f MB): close to the Apps Script project limit (~10 MB)'
              % (total / 1048576, SIZE_WARN_TOTAL / 1048576))


if __name__ == '__main__':
    main()
