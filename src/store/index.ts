/*
 * @Author:  
 * @Description:
 * @Date: 2023-01-13 17:44:59
 * @LastEditTime: 2023-01-29 15:34:32
 * @LastEditors:  
 */
import { watchOnce } from "@vueuse/core";
import { DropdownProps } from "naive-ui";
import { defineStore } from "pinia" // 定义容器
//修改store代码需要重启项目才生效

let eccangle = localStorage.getItem('eccangle') || 0
let rightBlockDataMap: any[][] = localStorage.getItem('rightBlockDataMap') ? JSON.parse(localStorage.getItem('rightBlockDataMap') || '[]') : [
    [],
    [],
    []
]
let dataSourceList = [
    {
        label: '直径1', key: 'diameter1', children: [
            { label: '直径1', key: 'diameter1-diameter1', },
            { label: '直径1X', key: 'diameter1-diameter1X', },
            { label: '直径1Y', key: 'diameter1-diameter1Y', },
            { label: '椭圆度 直径1', key: 'diameter1-ellip', },
        ]
    },
    {
        label: '热外径', key: 'heat', children: [
            { label: '热外径', key: 'heat-heat', },
            { label: '热外径X', key: 'heat-heatX', },
            { label: '热外径Y', key: 'heat-heatY', },
            { label: '椭圆度 热外径', key: 'heat-ellip', },
        ]
    },
    {
        label: '冷外径', key: 'cold', children: [
            { label: '冷外径', key: 'cold-cold', },
            { label: '冷外径X', key: 'cold-coldX', },
            { label: '冷外径Y', key: 'cold-coldY', },
            { label: '椭圆度 冷外径', key: 'cold-ellip', },
        ]
    },
    { label: '偏心', key: 'ecc', },
    { label: '同心度', key: 'concentricity', },
    { label: '冷电容', key: 'coldCap', },   //电容只有趋势图,只有平均值, 因此displayoption在选中电容后要隐藏
    {
        label: '壁厚', key: 'wall', children: [
            { label: '壁厚', key: 'wall-wall', },
            { label: '最大壁厚', key: 'wall-max', },
            { label: '最小壁厚', key: 'wall-min', },
        ]
    },
    { label: '事件', key: 'event', },
    { label: '生产线信息', key: 'productLine' }
]
const dropdownItemProp = {
    style: {
        fontSize: '1.2rem'
    }
}
const addProp = (list: any) => {
    if (!list) return
    return list.map((e: any) => {
        // e.props = Object.assign({}, dropdownItemProp)
        e.props = JSON.parse(JSON.stringify(dropdownItemProp))
        if (e.children) {
            e.children = addProp(e.children as any)
        }
        return e
    })
}
export const useMain = defineStore('useStore', {
    /**
     * 存储全局状态
     * 1.必须是箭头函数: 为了在服务器端渲染的时候避免交叉请求导致数据状态污染
     * 和 TS 类型推导
    */

    state: () => {
        return {
            isLowRes: false,     //是否为低分辨率

            dataSource: { label: '直径1', key: 'diameter1', },       //菜单选中的数据源
            timeZone: { label: '30min', key: 30, },
            isTorBar: true,                                     //公差条是否选中
            displayChart: { label: '数字显示/趋势图', key: 'dataChart' },         //显示的图表类型
            displayWay: { label: '平均值', key: 'avg' },                //显示的方式

            dataSourceList: addProp(dataSourceList),
            rightBlockDataMap: rightBlockDataMap,

            chineseMap: <Record<string, string>>{
                avg: '平均值',
                ellipse: '椭圆度'
            },
            eccAngle: eccangle,                                      //偏心扭转值

            db: <any>null,    //数据库实例
            dbReq: <IDBOpenDBRequest | null>null,  //数据库打开时返回的对象

            lastFocusedInput: <HTMLInputElement | null>null,
            globalKeyBoardShow: false,
            globalKeyBoardBlocked: false, //为 true 时输入框聚焦不弹出虚拟键盘（数据组态页）

            isLandscape: false, //是否横屏
        }
    },
    /**
     * 用来封装计算属性 有缓存功能  类似于computed
     */
    getters: {
        getDbPromise(): Promise<any> {
            return new Promise((resolve, reject) => {
                watchOnce(() => this.db, (db) => {
                    resolve(db)
                })
            })
        }
    },
    /**
     * 编辑业务逻辑  类似于methods
     */
    actions: {
        setDataSource(value: any) {
            this.dataSource = value;
        },
        setTimeZone(value: any) {
            this.timeZone = value;
        },
        setDisplayChart(value: any) {
            this.displayChart = value;
        },
        setDisplayWay(value: any) {
            this.displayWay = value;
        },
        changeIsTorBar() {
            this.isTorBar = !this.isTorBar;
        },
        setDataSourceList(value: any) {
            this.dataSourceList = value;
        },
        addRightBlockData(data: any, x: number, y: number) { //xy代表第几个value中的第几行
            this.rightBlockDataMap[x][y] = data;
            localStorage.setItem('rightBlockDataMap', JSON.stringify(this.rightBlockDataMap))
        },
        removeRightBlockData(x: number, y: number) {
            this.rightBlockDataMap[x][y] = null
            localStorage.setItem('rightBlockDataMap', JSON.stringify(this.rightBlockDataMap))
        },
        setIsLowRes(value: boolean) {
            console.log("🪵 [index.ts:150] ~ token ~ \x1b[0;32mvalue\x1b[0m = ", value);
            this.isLowRes = value
        },
        setEccAngle(value: number) {
            localStorage.setItem('eccangle', String(value))
            this.eccAngle = value
        },

        initDb() {
            let _this = this
            let request = window.indexedDB.open('nt', 8);
            var db
            request.onupgradeneeded = function (event) {
                //@ts-ignore
                db = event.target?.result;
                _this.db = db
                var objectStore;
                if (!db.objectStoreNames.contains('dataMap')) {
                    objectStore = db.createObjectStore('dataMap', { keyPath: 'id' });
                    objectStore.createIndex('ProtoType', 'ProtoType', { unique: false });

                }
                if (!db.objectStoreNames.contains('realTimeData')) {  //这里的realTimeData指的是数据通道里的实时数据表
                    objectStore = db.createObjectStore('realTimeData', { keyPath: 'id' });
                    objectStore.createIndex('ProtoType', 'ProtoType', { unique: false });
                }
                if (!db.objectStoreNames.contains('watchData')) {
                    objectStore = db.createObjectStore('watchData', { keyPath: 'id' });
                    objectStore.createIndex('ProtoType', 'ProtoType', { unique: false });
                }
                if (!db.objectStoreNames.contains('alarmData')) {
                    objectStore = db.createObjectStore('alarmData', { keyPath: 'id' });
                    objectStore.createIndex('ProtoType', 'ProtoType', { unique: false });
                    objectStore.createIndex('CondiId', 'CondiId', { unique: false });
                }
                if (!db.objectStoreNames.contains('OPCUA')) {
                    objectStore = db.createObjectStore('OPCUA', { keyPath: 'id' });
                    objectStore.createIndex('ProtoType', 'ProtoType', { unique: false });
                }
                if (!db.objectStoreNames.contains('connectDev')) {
                    objectStore = db.createObjectStore('connectDev', { keyPath: 'id' });
                    // objectStore.createIndex('ProtoType', 'ProtoType', { unique: false });
                }
                if (!db.objectStoreNames.contains('datav')) {
                    objectStore = db.createObjectStore('datav', { keyPath: 'id' });
                    // objectStore.createIndex('ProtoType', 'ProtoType', { unique: false });
                }
                // objectStore = event.target?.transaction.objectStore('alarmData');
                // objectStore.createIndex('CondiId', 'CondiId', { unique: false });
            }
            request.onsuccess = function (event) {
                //@ts-ignore
                db = event.target.result;
                console.log('Database opened successfully');
                _this.db = db
            }
            //@ts-ignore
            this.dbReq = request
        },

        setLastFocusedInput(value: any) {
            this.lastFocusedInput = value
        },
        setGlobalKeyBoardShow(value: boolean) {
            this.globalKeyBoardShow = value
        },
        setGlobalKeyBoardBlocked(value: boolean) {
            this.globalKeyBoardBlocked = value
        },
        setIsLandscape(value: boolean) {
            this.isLandscape = value
        }

    }

})
