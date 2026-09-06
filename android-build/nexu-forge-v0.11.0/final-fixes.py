from pathlib import Path
import sys,hashlib
root=Path(sys.argv[1]);p=root/'app/src/main/java/uk/co/sumerostudio/nexuai3dforge/MainActivity.java';s=p.read_text()
s=s.replace('new LinearLayout.LayoutParams(dp(112),-1)','new LinearLayout.LayoutParams(controlHeight(112),-1)')
s=s.replace('new LinearLayout.LayoutParams(dp(86),controlHeight(48))','new LinearLayout.LayoutParams(controlHeight(86),controlHeight(48))')
s=s.replace('flow.addView(viewPane,new LinearLayout.LayoutParams(-1,dp(390)))','flow.addView(viewPane,new LinearLayout.LayoutParams(-1,dp(210)+controlHeight(180)))')
s=s.replace('controls.addView(pickers);','''if(getResources().getConfiguration().fontScale>1.3f){pickers.setOrientation(LinearLayout.VERTICAL);profile.setLayoutParams(new LinearLayout.LayoutParams(-1,controlHeight(54)));mode.setLayoutParams(new LinearLayout.LayoutParams(-1,controlHeight(54)));}controls.addView(pickers);''')
s=s.replace('nav.addView(b,lp);}return nav;', '''if(!rail&&getResources().getConfiguration().fontScale>1.3f)lp=new LinearLayout.LayoutParams(controlHeight(90),-1);nav.addView(b,lp);}if(!rail&&getResources().getConfiguration().fontScale>1.3f){HorizontalScrollView scroller=new HorizontalScrollView(this);scroller.setFillViewport(true);scroller.addView(nav,new HorizontalScrollView.LayoutParams(-2,-1));return scroller;}return nav;''')
# Do not send automatically retried mutating calls after uncertain network outcomes.
assert 'startActivityForResult(' not in s and 'public void onBackPressed()' not in s
p.write_text(s)
# Repeatable source builds must resolve locked, reviewed dependencies; generate the lock in CI.
g=root/'app/build.gradle';text=g.read_text();text+='\ndependencyLocking { lockAllConfigurations() }\n';g.write_text(text)
Path('evidence/final-source-sha256.txt').write_text(hashlib.sha256(p.read_bytes()).hexdigest()+'  MainActivity.java\n')
