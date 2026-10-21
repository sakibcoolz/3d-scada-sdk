import { describe, expect, it } from 'vitest';
import { BoxGeometry, Group, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial, Raycaster, Scene, Vector3 } from 'three';
import { componentHit } from './pick.js';

const box = (x: number, userData: Record<string, unknown>) => {
  const m = new Mesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial());
  m.position.set(x, 0, 0);
  m.userData = userData;
  return m;
};
// A ray from the origin along +X.
const shoot = (scene: Scene) => {
  scene.updateMatrixWorld(true);
  return new Raycaster(new Vector3(0, 0, 0), new Vector3(1, 0, 0)).intersectObjects(scene.children, true);
};

describe('componentHit', () => {
  it('returns the nearest tagged component, looking through untagged geometry', () => {
    const scene = new Scene();
    scene.add(box(2, {}), box(4, { componentId: 'tank', role: 'shell' }), box(6, { componentId: 'pump', role: 'shell' }));
    expect(componentHit(shoot(scene), new Set(['tank', 'pump']))).toEqual({ id: 'tank', distance: expect.closeTo(3.5, 9) });
  });

  it('finds the id on an ancestor group', () => {
    const scene = new Scene();
    const group = new Group();
    group.userData = { componentId: 'valve' };
    group.add(box(3, {}));
    scene.add(group);
    expect(componentHit(shoot(scene), new Set(['valve']))?.id).toBe('valve');
  });

  it('skips open-joint markers and unknown ids', () => {
    const scene = new Scene();
    scene.add(box(2, { componentId: 'c1', role: 'open-joint' }), box(3, { componentId: 'ghost' }), box(5, { componentId: 'pipe' }));
    expect(componentHit(shoot(scene), new Set(['pipe']))?.id).toBe('pipe');
  });

  it('reads instanced members by instance id', () => {
    const scene = new Scene();
    const mesh = new InstancedMesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial(), 2);
    mesh.setMatrixAt(0, new Matrix4().makeTranslation(8, 0, 0));
    mesh.setMatrixAt(1, new Matrix4().makeTranslation(3, 0, 0));
    mesh.userData = { componentIds: ['far', 'near'] };
    scene.add(mesh);
    expect(componentHit(shoot(scene), new Set(['far', 'near']))?.id).toBe('near');
  });

  it('returns undefined when nothing is hit', () => {
    expect(componentHit([], new Set(['a']))).toBeUndefined();
  });
});
