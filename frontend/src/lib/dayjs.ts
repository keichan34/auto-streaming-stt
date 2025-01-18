import dayjs from "dayjs";
import CustomDateFormat from "dayjs/plugin/customParseFormat";
import LocalizedFormat from "dayjs/plugin/localizedFormat";
import 'dayjs/locale/ja';

dayjs.locale('ja');
dayjs.extend(CustomDateFormat);
dayjs.extend(LocalizedFormat);

export default dayjs;
