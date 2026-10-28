export const TECHS = [
  {
    id: 'tech_grid',
    name: '网格重构',
    branch: 'energy',
    cost: 40,
    requires: [],
    description: '重建设备供电协议。全部能源产出提高百分之十。',
    effects: { energyMultiplier: 1.1 },
    position: { x: 0, y: 0 }
  },
  {
    id: 'tech_geothermal',
    name: '地热开采',
    branch: 'energy',
    cost: 220,
    requires: ['tech_grid', 'tech_deep_drill1'],
    description: '解锁地热井，提供不受日照与风力影响的稳定电力。',
    effects: { energyMultiplier: 1.05 },
    position: { x: 0, y: 4 }
  },
  {
    id: 'tech_fission',
    name: '裂变工程',
    branch: 'energy',
    cost: 700,
    requires: ['tech_geothermal', 'tech_assembly'],
    description: '解锁裂变堆，并将全部能源产出提高百分之二十五。',
    effects: { energyMultiplier: 1.25, productionMultiplier: 1.05 },
    position: { x: 0, y: 5 }
  },
  {
    id: 'tech_fusion',
    name: '聚变协议',
    branch: 'energy',
    cost: 3200,
    requires: ['tech_fission', 'tech_fuel', 'tech_simulation'],
    description: '解锁聚变堆。高密度能源足以支撑最后的文明演算。',
    effects: { energyMultiplier: 1.5 },
    position: { x: 0, y: 7 }
  },
  {
    id: 'tech_refining',
    name: '精炼工艺',
    branch: 'processing',
    cost: 60,
    requires: [],
    description: '解锁精炼厂，全部加工与采集产出提高百分之十。',
    effects: { productionMultiplier: 1.1 },
    position: { x: 1, y: 1 }
  },
  {
    id: 'tech_purification1',
    name: '净化 Lv1',
    branch: 'processing',
    cost: 50,
    requires: [],
    description: '解锁大气收集器，建立基础过滤与污染控制流程。',
    effects: { productionMultiplier: 1.05 },
    position: { x: 1, y: 0 }
  },
  {
    id: 'tech_purification2',
    name: '净化 Lv2',
    branch: 'processing',
    cost: 180,
    requires: ['tech_purification1'],
    description: '开放锈蚀沼泽，提高加工产出并降低商路腐蚀损耗。',
    effects: { productionMultiplier: 1.1, routeLossReduction: 0.05 },
    position: { x: 1, y: 2 }
  },
  {
    id: 'tech_deep_drill1',
    name: '深钻 Lv1',
    branch: 'processing',
    cost: 160,
    requires: ['tech_refining'],
    description: '解锁深钻井与裂谷矿带，使深层稀土成为可运输资源。',
    effects: { productionMultiplier: 1.15 },
    position: { x: 1, y: 3 }
  },
  {
    id: 'tech_insulation1',
    name: '保温 Lv1',
    branch: 'energy',
    cost: 150,
    requires: ['tech_grid', 'tech_purification1'],
    description: '为管线与设备增加被动绝热层，小幅提高能源效率。',
    effects: { energyMultiplier: 1.05 },
    position: { x: 0, y: 1 }
  },
  {
    id: 'tech_insulation2',
    name: '保温 Lv2',
    branch: 'energy',
    cost: 300,
    requires: ['tech_insulation1', 'tech_purification2'],
    description: '解锁氦-3提取器，为永夜环境下的低温作业做准备。',
    effects: { energyMultiplier: 1.08, productionMultiplier: 1.05 },
    position: { x: 0, y: 2 }
  },
  {
    id: 'tech_insulation3',
    name: '保温 Lv3',
    branch: 'energy',
    cost: 480,
    requires: ['tech_insulation2', 'tech_deep_drill1'],
    description: '开放永夜冰原，完整低温维生体系降低极端环境损耗。',
    effects: { energyMultiplier: 1.1, routeLossReduction: 0.05 },
    position: { x: 0, y: 3 }
  },
  {
    id: 'tech_assembly',
    name: '精密装配',
    branch: 'processing',
    cost: 140,
    requires: ['tech_refining', 'tech_purification1'],
    description: '解锁芯片厂，将全部生产建筑效率提高百分之二十。',
    effects: { productionMultiplier: 1.2 },
    position: { x: 1, y: 4 }
  },
  {
    id: 'tech_simulation',
    name: '大规模模拟',
    branch: 'processing',
    cost: 600,
    requires: ['tech_assembly', 'tech_grid'],
    description: '解锁数据核心与模拟器，全部数据产出提高百分之五十。',
    effects: { dataMultiplier: 1.5 },
    position: { x: 1, y: 5 }
  },
  {
    id: 'tech_logistics',
    name: '网络物流',
    branch: 'logistics',
    cost: 100,
    requires: ['tech_grid'],
    description: '解锁中转站与跨图商路，基础物流容量增加二十。',
    effects: { logisticsCapacity: 20 },
    position: { x: 2, y: 1 }
  },
  {
    id: 'tech_pipeline',
    name: '管道运输',
    branch: 'logistics',
    cost: 450,
    requires: ['tech_logistics', 'tech_purification2'],
    description: '以密封管线取代暴露车队，增加六十运力并降低百分之十损耗。',
    effects: { logisticsCapacity: 60, routeLossReduction: 0.1 },
    position: { x: 2, y: 3 }
  },
  {
    id: 'tech_elevator',
    name: '轨道运力',
    branch: 'logistics',
    cost: 1700,
    requires: ['tech_pipeline', 'tech_space1'],
    description: '解锁轨道电梯，增加二百运力并进一步降低运输损耗。',
    effects: { logisticsCapacity: 200, routeLossReduction: 0.1 },
    position: { x: 2, y: 6 }
  },
  {
    id: 'tech_hardening',
    name: '结构加固',
    branch: 'logistics',
    cost: 350,
    requires: ['tech_refining', 'tech_logistics'],
    description: '解锁加固工程，提高节点韧性并降低商路灾变损失。',
    effects: { productionMultiplier: 1.05, routeLossReduction: 0.05 },
    position: { x: 2, y: 2 }
  },
  {
    id: 'tech_space1',
    name: '航天 Lv1',
    branch: 'aerospace',
    cost: 1000,
    requires: ['tech_assembly', 'tech_logistics', 'tech_insulation3'],
    description: '开放轨道残骸带并解锁发射台，建立地外物流坐标。',
    effects: { logisticsCapacity: 50, productionMultiplier: 1.05 },
    position: { x: 3, y: 4 }
  },
  {
    id: 'tech_rocketry',
    name: '运载器工程',
    branch: 'aerospace',
    cost: 2000,
    requires: ['tech_space1', 'tech_fission', 'tech_fuel'],
    description: '解锁火箭装配厂，将文明备份整合为可发射载荷。',
    effects: { productionMultiplier: 1.15, logisticsCapacity: 50 },
    position: { x: 3, y: 6 }
  },
  {
    id: 'tech_fuel',
    name: '氦-3燃料',
    branch: 'aerospace',
    cost: 1250,
    requires: ['tech_insulation3', 'tech_purification2'],
    description: '解锁燃料厂，把冰原氦-3与化学品转化为运载火箭燃料。',
    effects: { productionMultiplier: 1.15 },
    position: { x: 3, y: 5 }
  },
  {
    id: 'tech_upload',
    name: '意识上传',
    branch: 'aerospace',
    cost: 6000,
    requires: ['tech_fusion', 'tech_simulation', 'tech_elevator', 'tech_rocketry'],
    description: '完成无物理载体的文明编码，开放上传结局。',
    effects: { dataMultiplier: 2, productionMultiplier: 1.25 },
    position: { x: 3, y: 7 }
  }
];

export const TECH_BY_ID = Object.fromEntries(
  TECHS.map((tech) => [tech.id, tech])
);
