import path from 'node:path';
import {pathToFileURL} from 'node:url';
import fs from 'node:fs/promises';
import {spawnSync} from 'node:child_process';

const root=process.cwd();
const runtime=path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies');
process.env.RUNTIME_NODE_MODULES=path.join(runtime,'node/node_modules');
const skill=path.join(process.env.USERPROFILE,'.codex/plugins/cache/openai-primary-runtime/presentations/26.1007.11041/skills/presentations');
const {finalizePresentation}=await import(pathToFileURL(path.join(skill,'container_tools/artifact_tool_utils.mjs')));
const candidatePath=path.join(root,`.cache/course-build/rtl-motion-${Date.now()}.pptx`);
await fs.copyFile(path.resolve(process.argv[2] || '.cache/course-build/animated-candidate.pptx'),candidatePath);
const rtl=spawnSync(path.join(runtime,'python/python.exe'),[path.join(root,'courses/bnei-zion/session-01/rtl-package.py'),candidatePath,'--paragraphs-only'],{encoding:'utf8'});
if(rtl.status!==0)throw Error(rtl.stderr);
const result=await finalizePresentation({
  workspaceDir:root,
  candidatePath,
  finalPath:path.join(root,'output/bnei-zion-session-01',process.argv[3] || 'בינה מלאכותית בעבודה שלכם - מפגש ראשון - מלוטש.pptx'),
  pythonExecutable:path.join(runtime,'python/python.exe'),
  integrityValidatorPath:path.join(skill,'container_tools/inspect_presentation_package_integrity.py'),
  layoutValidatorPath:path.join(skill,'container_tools/inspect_presentation_layout_geometry.py'),
  layoutArgs:['--expected-slide-size-emu','12192000,6858000','--validate-heading-fit'],
  explicitTotalSlideCount:48,
  fontPolicy:{basis:'design',families:['Arial']},
  verifyArtifactToolImport:true,
  receiptPath:path.join(root,`.cache/course-build/motion-validation-${Date.now()}.json`),
});
console.log(result);
