// Integration layer only. The original drawing engines and their defaults remain unchanged.
import {renderProject as renderOriginal,validateProject as validateOriginal} from './core.js';
import {effectiveProject,validateCollaboration} from './collaboration.js';
export {styles,createProject,createScene,createLayer,loadAssets,getSceneAt,getDuration,getLayerPose,clamp} from './core.js';

export function renderProject(ctx,project,time,options={}){
  const view=effectiveProject(project,time,{excludeEditId:options.excludeEditId});
  return renderOriginal(ctx,view,time,options);
}
export function validateProject(raw){
  const project=validateOriginal(raw);
  if(project.collaboration)validateCollaboration(project);
  return project;
}
