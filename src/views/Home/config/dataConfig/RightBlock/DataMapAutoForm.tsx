import { MyFormWrap, formListItem } from "@/components/MyFormWrap/MyFormWrap";
import { SelectProps, useMessage } from "naive-ui";
import { computed, defineComponent, nextTick, PropType, reactive, ref, watch } from "vue";
import { v4 as uuidv4 } from 'uuid';
import { useConfigStore } from "@/store/config";
//@ts-ignore
import devRegiTypeData from '@/store/jsonData/dev_regitype.js'
//@ts-ignore
import devProtoClassData from '@/store/jsonData/dev_protoclass.js'
import { useDataConfigPartStore } from "../dataConfigPartStore";
import { useMain } from "@/store";

export type DataMapAutoFormExpose = {
  optionMap: Record<string, SelectProps['options']>
}

export default defineComponent({
  name: 'DataMapAutoForm',  // ModBusTCPSlave 专用
  props: {
    getFn: Function,  //获取table参数
    pItemList: Array as PropType<formListItem[]>,
    pOptionMap: Object as PropType<Record<string, SelectProps['options']>>,
    tableName: String,

    //剩下的参数自动放到ctx.attrs里, 注入到MyFormWrap中
  },
  setup(props, ctx) {
    const configStore = useConfigStore()
    const store = useMain()
    const msg = useMessage()
    const dataConfigPartStore = useDataConfigPartStore()
    const loading = ref(false)
    const isAddMore = ref(false)
    let curProtoRegiDataList: any[] = []
    let hasRegiType = false
    const legnthItem = { type: 'numInput', label: '数据长度', prop: 'Length', numAsString: true, width: 6, rule: 'must' }
    // const remarkItem = { type: 'input', label: '通道备注', prop: 'Remark', width: 6, }
    const itemList = ref<formListItem[]>(props.pItemList || [])
    const optionMap: Record<string, SelectProps['options']> = reactive({
      // RegiType: [],
      LHpostion: ['3412', '1234', '2143', '4321'].map((e) => {
        return { label: e, value: e }
      }),
      ...(props.pOptionMap || {})
    })
    const initDefaultVal = (prop: string) => {
      let form = ctx.attrs.form as commonForm
      if (!form.id) {
        optionMap[prop] && (form[prop] = String(optionMap[prop]![0].value))
      }
    }
    const initItemList = () => {
      if (props.pItemList) {
        hasRegiType = props.pItemList.some(e => e.prop == 'RegiType')
        return
      }
      let item = devProtoClassData.find((e: any) => e.ProtoType == dataConfigPartStore.checkedRowItem?.ProtoType)
      if (!item) return
      let formData = JSON.parse(item.FormData)
      let list = formData.fields.map((e: any) => {
        let config = e.__config__
        let prop = e.__vModel__
        if (prop == 'RegiType') {
          prop = 'RegiData'
        }
        if (prop == 'PreFixReg') {
          hasRegiType = true
          prop = 'RegiType'
        }
        initDefaultVal(prop)
        let type = config.tag.split('-')[1]
        return { type: type, label: config.label, prop: prop, width: 6, rule: config.required ? 'must' : undefined, ...(type == 'select' ? { placement: 'top' } : {}) }
      })
      itemList.value = list
    }
    initItemList()
    const initOptionMap = () => {
      let form = ctx.attrs.form as commonForm
      curProtoRegiDataList = devRegiTypeData.filter((e: any) => e.ProtocolType == dataConfigPartStore.checkedRowItem?.ProtoType)
      // debugger
      optionMap.RegiData = curProtoRegiDataList.filter((e: any) => e.RegiData).map((e: any) => {
        return {
          label: e.RegiData,
          value: e.RegiData
        }
      })
      if (optionMap.RegiData.length == 0) {
        optionMap.RegiType = curProtoRegiDataList.map((e: any) => ({
          label: e.RegiType,
          value: e.RegiType
        }))
      }


      let transaction = store.db.transaction(['dataMap'])
      var objectStore = transaction.objectStore('dataMap')
      let keyRange = IDBKeyRange.only(`Modbus-TCP-Slave`)
      var request = objectStore.index("ProtoType").getAll(keyRange)
      // .get(dataConfigPartStore.checkedRowItem?.ProtoType)
      request.onsuccess = function (event: any) {
        optionMap.Code = event.target.result.reverse().map((e: any) => ({
          label: `${e.Code} - ${e.Remark}`, value: e.Code
        }))
      }

      if (form.id) {  //编辑时初始化下拉数据
        let itemWithRegiData = undefined
        if (form.RegiData) {
          itemWithRegiData = curProtoRegiDataList.find((e: any) => {
            return e.RegiData == form.RegiData
          })
          if (hasRegiType) {
            optionMap.RegiType = itemWithRegiData?.RegiType.split('/').map((e: any) => {
              return {
                label: e,
                value: e
              }
            })
          }

        }
        let item = hasRegiType ? curProtoRegiDataList.find((e: any) => {
          let res = false
          if (e.RegiType.search('/') > -1) {
            let list = e.RegiType.split('/')
            res = list.find((ee: any) => {
              return ee == form.RegiType
            })
          } else {
            res = e.RegiType == form.RegiType
          }
          return res
        }) : itemWithRegiData
        optionMap.DataType = item?.DataType.split('/').map((e: any) => {
          return {
            label: e,
            value: e
          }
        })
        optionMap.Writable = item?.Writable.split('/').map((e: any) => {
          return {
            label: e,
            value: e
          }
        })
      }
    }
    initOptionMap()


    const submit = (fdata: commonForm) => {
      console.log(fdata)
      loading.value = true
      var transaction = store.db.transaction([props.tableName || "dataMap"], "readwrite");
      // 在所有数据添加完毕后的处理
      transaction.oncomplete = function (event: any) {
        !isAddMore.value && ctx.emit('update:show', false)
        loading.value = false
        props.getFn && props.getFn()
        msg.success('保存成功')
        if (isAddMore) {
          (ctx.attrs.form as commonForm).Code = ''
        }
      };
      var objectStore = transaction.objectStore(props.tableName || "dataMap");

      if (!fdata.Length) {
        fdata.Length = '1'
        if (fdata.DataType.search('32位') > -1)
          fdata.Length = '2'
      }
      if (!fdata.ProtoType) {
        fdata.ProtoType = dataConfigPartStore.checkedRowItem?.ProtoType
      }
      if (!fdata.id) {
        fdata.id = uuidv4()
        fdata.createTime = String(new Date().getTime())
        objectStore.add(fdata)
      } else {
        objectStore.put(fdata)
      }

    }

    const finalItemList = computed(() => {

      return [
        ...itemList.value,
        // ...((form.DataType && form.DataType.search("ASCII") > -1) ? [legnthItem] : []),
        // remarkItem
      ]
    })

    const finalOptionMap = computed(() => {


      return {
        ...optionMap,
        // ...obj.DataType ? obj : {}
      }
    })

    ctx.expose({
      optionMap
    } as  DataMapAutoFormExpose)

    watch(() => {
      let form = ctx.attrs.form as commonForm
      return form.RegiData
    }, (val) => {
      if (val) {
        let item = curProtoRegiDataList.find((e: any) => {
          return e.RegiData == val
        })
        optionMap.RegiType = item?.RegiType.split('/').map((e: any) => {
          return {
            label: e,
            value: e
          }
        })
        if (!hasRegiType) {
          optionMap.DataType = item?.DataType.split('/').map((e: any) => {
            return {
              label: e,
              value: e
            }
          })
          optionMap.Writable = item?.Writable.split('/').map((e: any) => {
            return {
              label: e,
              value: e
            }
          })
        }
        Object.assign(ctx.attrs.form as commonForm, { RegiType: '', Writable: '', DataType: '' })
      }
    })
    watch(() => {
      let form = ctx.attrs.form as commonForm
      return form.RegiType
    }, (val) => {
      if (val) {
        let item = curProtoRegiDataList.find((e: any) => {
          let res = false
          if (e.RegiType.search('/') > -1) {
            let list = e.RegiType.split('/')
            res = list.find((ee: any) => {
              return ee == val
            })
          } else {
            res = e.RegiType == val
          }
          return res
        })
        optionMap.DataType = item?.DataType.split('/').map((e: any) => {
          return {
            label: e,
            value: e
          }
        })
        optionMap.Writable = item?.Writable.split('/').map((e: any) => {
          return {
            label: e,
            value: e
          }
        })
        Object.assign(ctx.attrs.form as commonForm, { Writable: '', DataType: '' })
      }
    })

    watch(() => {
      let form = ctx.attrs.form as commonForm
      return form.Code
    }, (val) => {
      if (!val)
        return
      let item = optionMap.Code?.find(e => e.value == val)
      let form = ctx.attrs.form as commonForm
      form.Remark = ((item?.label as string).split('-')[1])
    })

    return () => {
      return (
        <MyFormWrap optionMap={finalOptionMap.value} itemList={finalItemList.value} submitFn={submit} btnStyleStr={'margin-right:50px;margin-bottom:10px;'} hasAddMore={!(ctx.attrs.form as commonForm).id} loading={loading.value} v-model:isAddMore={isAddMore.value} />
      )
    }
  }

})