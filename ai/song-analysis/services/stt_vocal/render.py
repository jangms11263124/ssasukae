"""Generate a dependency-free browser preview for karaoke timing JSON."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Mapping


def render_karaoke_html(
    document: Mapping[str, Any], *, audio_source: str | None = None
) -> str:
    """Return a standalone HTML karaoke player.

    The JSON is embedded as data, not markup, and ``<`` is escaped to prevent a
    lyric from terminating the script tag.  If no audio source is supplied the
    page presents a local-file picker.
    """

    payload = json.dumps(document, ensure_ascii=False).replace("<", "\\u003c")
    source = json.dumps(audio_source, ensure_ascii=False).replace("<", "\\u003c")
    return _HTML_TEMPLATE.replace("__KARAOKE_DATA__", payload).replace(
        "__AUDIO_SOURCE__", source
    )


def render_file(
    timing_json: str | Path,
    output_html: str | Path,
    *,
    audio_source: str | None = None,
) -> Path:
    timing_json = Path(timing_json)
    output_html = Path(output_html)
    document = json.loads(timing_json.read_text(encoding="utf-8"))
    output_html.parent.mkdir(parents=True, exist_ok=True)
    output_html.write_text(
        render_karaoke_html(document, audio_source=audio_source), encoding="utf-8"
    )
    return output_html


_HTML_TEMPLATE = r'''<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>stt-vocal karaoke preview</title>
<style>
  :root { color-scheme: dark; --accent:#7cf6c7; --dim:#727887; }
  * { box-sizing:border-box; }
  body { margin:0; min-height:100vh; font-family:system-ui,"Noto Sans KR",sans-serif;
         background:radial-gradient(circle at 50% 15%,#263149 0,#10131b 44%,#080a0f 100%);
         color:#f7f9ff; display:grid; place-items:center; }
  main { width:min(960px,94vw); padding:36px 24px 24px; }
  h1 { margin:0 0 22px; font-size:clamp(20px,3vw,34px); letter-spacing:-.03em; }
  #lyrics { height:min(58vh,560px); overflow:auto; scroll-behavior:smooth;
            mask-image:linear-gradient(transparent,#000 12%,#000 88%,transparent); padding:20vh 0; }
  .line { margin:18px 0; text-align:center; font-size:clamp(23px,4.4vw,48px);
          font-weight:750; line-height:1.55; opacity:.28; transform:scale(.96);
          transition:opacity .2s,transform .2s; }
  .line.current { opacity:1; transform:scale(1); }
  .unit { position:relative; display:inline-block; color:var(--dim); white-space:pre; }
  .unit::after { content:attr(data-text); position:absolute; inset:0; color:var(--accent);
                 width:calc(var(--fill,0) * 100%); overflow:hidden; white-space:pre; }
  .unit.past { --fill:1; }
  .unit.gap-before { margin-left:.34em; }
  footer { display:grid; gap:12px; padding:18px; border:1px solid #ffffff19;
           border-radius:18px; background:#121722cc; backdrop-filter:blur(12px); }
  audio { width:100%; }
  label { font-size:14px; color:#bac1d1; }
  #status { min-height:1.4em; color:#9da6ba; font-size:13px; }
</style>
</head>
<body>
<main>
  <h1>음절 타이밍 미리보기</h1>
  <section id="lyrics" aria-live="off"></section>
  <footer>
    <audio id="audio" controls preload="metadata"></audio>
    <label id="picker-label">오디오 선택 <input id="picker" type="file" accept="audio/*"></label>
    <div id="status"></div>
  </footer>
</main>
<script>
const DATA=__KARAOKE_DATA__;
const AUDIO_SOURCE=__AUDIO_SOURCE__;
const audio=document.querySelector('#audio');
const lyrics=document.querySelector('#lyrics');
const picker=document.querySelector('#picker');
const pickerLabel=document.querySelector('#picker-label');
const status=document.querySelector('#status');
const unitNodes=[];
const MIN_ACTIVE_FILL=0.06;
const HIGHLIGHT_LEAD_SECONDS=0.08;

function value(obj,...keys){ for(const key of keys) if(obj?.[key]!==undefined) return obj[key]; }
for(const [lineIndex,line] of (DATA.lines||[]).entries()){
  const row=document.createElement('div'); row.className='line'; row.dataset.line=String(lineIndex);
  const units=line.syllables||line.units||[];
  let textCursor=0;
  for(const [unitIndex,unit] of units.entries()){
    const charStart=Number(unit.char_start), charEnd=Number(unit.char_end);
    if(Number.isInteger(charStart)&&charStart>=textCursor&&typeof line.text==='string'){
      row.append(document.createTextNode(line.text.slice(textCursor,charStart)));
    }
    const span=document.createElement('span');
    const text=String(value(unit,'text','syllable','unit','token')??'');
    span.className='unit';
    span.textContent=text; span.dataset.text=text;
    const rawStart=value(unit,'start'), rawEnd=value(unit,'end');
    const unitStart=Number(rawStart), unitEnd=Number(rawEnd);
    if(rawStart!==null&&rawStart!==undefined&&Number.isFinite(unitStart)){
      span.dataset.start=String(unitStart);
    }
    if(rawEnd!==null&&rawEnd!==undefined&&Number.isFinite(unitEnd)){
      span.dataset.end=String(unitEnd);
    }
    span.dataset.line=String(lineIndex); span.dataset.unit=String(unitIndex);
    row.append(span); unitNodes.push(span);
    if(Number.isInteger(charEnd)) textCursor=Math.max(textCursor,charEnd);
  }
  if(!units.length) row.textContent=line.text||'';
  else if(typeof line.text==='string'&&textCursor<line.text.length){
    row.append(document.createTextNode(line.text.slice(textCursor)));
  }
  lyrics.append(row);
}

if(AUDIO_SOURCE){ audio.src=AUDIO_SOURCE; pickerLabel.hidden=true; }
picker.addEventListener('change',()=>{
  if(picker.files?.[0]) audio.src=URL.createObjectURL(picker.files[0]);
});

let currentLine=-1;
function paint(){
  const now=audio.currentTime;
  let activeLine=-1;
  let upcomingNode=null;
  let latestPastLine=-1;
  for(const node of unitNodes){
    const start=Number(node.dataset.start), end=Number(node.dataset.end);
    const hasTiming=Number.isFinite(start)&&Number.isFinite(end)&&end>start;
    const paintStart=Math.max(0,start-HIGHLIGHT_LEAD_SECONDS);
    let fill=0;
    if(hasTiming){
      fill=Math.max(0,Math.min(1,(now-paintStart)/(end-paintStart)));
      // A long held syllable otherwise advances by less than one visible pixel
      // on its first frames, which makes an accurate onset look late.
      if(paintStart<=now&&now<end) fill=Math.max(fill,MIN_ACTIVE_FILL);
    }
    node.style.setProperty('--fill',String(fill));
    node.classList.toggle('past',fill>=1);
    if(hasTiming){
      if(paintStart<=now&&now<end) activeLine=Number(node.dataset.line);
      else if(end<=now) latestPastLine=Number(node.dataset.line);
      else if(paintStart>now&&upcomingNode===null) upcomingNode=node;
    }
  }
  let nextLine=activeLine;
  if(nextLine<0&&upcomingNode){
    nextLine=Number(upcomingNode.dataset.line);
  }else if(nextLine<0){
    nextLine=latestPastLine;
  }
  if(nextLine!==currentLine){
    document.querySelector('.line.current')?.classList.remove('current');
    const line=document.querySelector(`.line[data-line="${nextLine}"]`);
    line?.classList.add('current'); line?.scrollIntoView({block:'center'});
    currentLine=nextLine;
  }
  status.textContent=`${now.toFixed(2)}초 · ${unitNodes.length}개 표시 단위`;
  requestAnimationFrame(paint);
}
requestAnimationFrame(paint);
</script>
</body>
</html>'''


__all__ = ["render_file", "render_karaoke_html"]
