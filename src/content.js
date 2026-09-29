// All narrative copy lives here. Caption times are seconds from chapter start.
// *text* marks a key term (rendered in the accent colour).

export const ACTS = [
  { id: 'make', en: 'PART I', zh: '体外制备', short: '制备' },
  { id: 'deliver', en: 'PART II', zh: '回输体内', short: '回输' },
  { id: 'attack', en: 'PART III', zh: '精准杀伤', short: '杀伤' },
];

export const CHAPTERS = [
  {
    id: 'intro',
    shots: ['intro'],
    captions: [],
  },
  {
    id: 'collect',
    num: '01',
    act: 0,
    zh: '采集',
    en: 'LEUKAPHERESIS',
    shots: ['collect'],
    captions: [
      { t0: 1.0, t1: 6.6, text: '旅程从患者自己的血液开始：通过*白细胞单采术*，血液被引出体外，进入分离设备。' },
      { t0: 7.0, t1: 12.8, text: '离心力让血液按密度分层，富含 T 细胞的*白细胞层*被收集下来，其余成分回输给患者。' },
    ],
  },
  {
    id: 'activate',
    num: '02',
    act: 0,
    zh: '激活',
    en: 'ACTIVATION',
    shots: ['activate'],
    captions: [
      { t0: 0.8, t1: 5.8, text: '分离出的 T 细胞与包被*抗 CD3/CD28 抗体*的磁珠相遇，这模拟了免疫系统的“启动信号”。' },
      { t0: 6.2, t1: 11.0, text: '被唤醒的 T 细胞体积增大、代谢活跃，进入增殖状态，为基因改造做好准备。' },
    ],
  },
  {
    id: 'transduce',
    num: '03',
    act: 0,
    zh: '基因转导',
    en: 'TRANSDUCTION',
    shots: ['transduceA', 'transduceB', 'transduceC'],
    captions: [
      { t0: 0.8, t1: 6.8, text: '经过改造、不具复制能力的*慢病毒载体*，携带 CAR 基因进入 T 细胞。' },
      { t0: 7.4, t1: 12.6, text: '在细胞内，载体 RNA 被*逆转录*成 DNA，并被送入细胞核。' },
      { t0: 13.2, t1: 19.6, text: 'CAR 基因*整合*进 T 细胞的基因组：从此，这个细胞及其所有子代都能表达 CAR。' },
    ],
  },
  {
    id: 'car',
    num: '04',
    act: 0,
    zh: 'CAR 结构',
    en: 'RECEPTOR DESIGN',
    shots: ['car'],
    captions: [
      { t0: 0.8, t1: 7.2, text: 'CAR 即“嵌合抗原受体”。顶端的*单链抗体片段（scFv）*负责识别肿瘤抗原。' },
      { t0: 7.6, t1: 14.6, text: '铰链区与跨膜区把它锚定在细胞膜上；胞内的*共刺激域*与 *CD3ζ* 把“发现目标”转化为“攻击指令”。' },
    ],
  },
  {
    id: 'expand',
    num: '05',
    act: 0,
    zh: '扩增',
    en: 'EXPANSION',
    shots: ['expand'],
    captions: [
      { t0: 0.8, t1: 6.2, text: '改造成功的 CAR-T 细胞在培养体系中不断分裂，数量扩增至*数亿*个。' },
      { t0: 6.6, t1: 11.8, text: '通过严格的质量检测后，细胞被冷冻保存并运回医院。整个制备过程通常需要数周。' },
    ],
  },
  {
    id: 'infuse',
    num: '06',
    act: 1,
    zh: '回输',
    en: 'INFUSION',
    shots: ['infuseBag', 'infuseVein'],
    captions: [
      { t0: 0.8, t1: 6.4, text: '回输前，患者通常先接受*清淋化疗*，为 CAR-T 细胞的扩增腾出空间。' },
      { t0: 6.8, t1: 12.8, text: '复苏后的 CAR-T 细胞经*静脉输注*，回到患者体内。' },
    ],
  },
  {
    id: 'traffic',
    num: '07',
    act: 1,
    zh: '归巢',
    en: 'TRAFFICKING',
    shots: ['vessel', 'extravasate'],
    captions: [
      { t0: 0.8, t1: 6.6, text: 'CAR-T 细胞随血液流遍全身，在血管中巡游。' },
      { t0: 7.2, t1: 15.6, text: '在肿瘤释放的*趋化因子*引导下，它们黏附于血管壁，穿过内皮细胞间隙，进入肿瘤组织。' },
    ],
  },
  {
    id: 'recognize',
    num: '08',
    act: 2,
    zh: '识别',
    en: 'RECOGNITION',
    shots: ['approach', 'binding'],
    captions: [
      { t0: 0.6, t1: 5.8, text: '在肿瘤组织中，CAR-T 细胞不断接触周围的细胞，搜寻目标。' },
      { t0: 6.2, t1: 11.8, text: 'CAR 与肿瘤细胞表面的特定抗原（如 *CD19*）精准结合。这种识别*不依赖 MHC* 分子呈递。' },
    ],
  },
  {
    id: 'synapse',
    num: '09',
    act: 2,
    zh: '免疫突触',
    en: 'IMMUNE SYNAPSE',
    shots: ['synapse'],
    captions: [
      { t0: 0.6, t1: 5.2, text: '大量 CAR 在接触面聚集，形成*免疫突触*。CD3ζ 与共刺激信号被激活，并层层放大。' },
      { t0: 5.6, t1: 10.6, text: 'T 细胞进入战斗状态：装载杀伤性物质的*颗粒*向突触集结，同时释放多种*细胞因子*。' },
    ],
  },
  {
    id: 'kill',
    num: '10',
    act: 2,
    zh: '杀伤',
    en: 'CYTOTOXICITY',
    shots: ['perforin', 'apoptosis'],
    captions: [
      { t0: 0.6, t1: 7.6, text: 'CAR-T 细胞释放*穿孔素*，在肿瘤细胞膜上形成孔道；*颗粒酶*随之进入细胞内部。' },
      { t0: 8.2, t1: 17.4, text: '颗粒酶启动*凋亡*程序：肿瘤细胞膜泡化、皱缩，最终裂解为凋亡小体，被机体清除。' },
    ],
  },
  {
    id: 'serial',
    num: '11',
    act: 2,
    zh: '连续杀伤',
    en: 'SERIAL KILLING',
    shots: ['serial'],
    captions: [
      { t0: 0.6, t1: 6.2, text: '完成一次杀伤后，CAR-T 细胞迅速脱离，转向下一个目标，这被称为“*连续杀伤*”。' },
      { t0: 6.6, t1: 12.6, text: '在抗原刺激下，CAR-T 细胞还会在体内*大量扩增*，抗肿瘤力量不断壮大。' },
    ],
  },
  {
    id: 'memory',
    num: '12',
    act: 2,
    zh: '长期守护',
    en: 'PERSISTENCE',
    shots: ['memory'],
    captions: [{ t0: 0.8, t1: 6.4, text: '部分 CAR-T 细胞可在体内长期存留，形成*免疫记忆*，持续监视肿瘤复发。' }],
  },
];

export const TITLE = {
  over: 'CELLULAR IMMUNOTHERAPY',
  main: 'CAR-T',
  zh: '细胞之旅',
  sub: '从体外改造，到精准清除肿瘤细胞',
  en: 'Chimeric Antigen Receptor T-Cell Therapy',
};

export const END = {
  main: 'CAR-T',
  zh: '活的药物',
  en: 'A LIVING DRUG',
  tagline: '以患者自身的免疫细胞为原料，经基因改造后回到体内，精准清除肿瘤。',
  note:
    '科普示意动画：细胞与分子的比例及时间尺度均经艺术化处理，不构成医疗建议。' +
    'CAR-T 治疗可能引起细胞因子释放综合征（CRS）、免疫效应细胞相关神经毒性综合征（ICANS）等不良反应，须在具备资质的医疗机构中进行。',
};

export const UI = {
  play: '播放',
  pause: '暂停',
  replay: '重新播放',
  sound: '声音',
  full: '全屏',
  hint: '约 3 分钟 · 建议开启声音',
  loading: '正在准备场景',
};
