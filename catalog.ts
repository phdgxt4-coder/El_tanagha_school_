import type { Role } from '../security/authorization';

export type Field = { name: string; label: string; type?: string; placeholder?: string; accept?: string; required?: boolean };
export type Feature = { title: string; collection?: string; fields?: Field[]; action?: 'create' | 'uploadPdf' | 'uploadFile' | 'youtube' | 'contentManager' | 'export' | 'role' | 'search' | 'theme'; description: string };

const f=(title:string,description:string,collection?:string,fields?:Field[],action?:Feature['action']):Feature=>({title,description,collection,fields,action});
const text=(name:string,label:string,placeholder=''):Field=>({name,label,placeholder});
const date=(name:string,label:string):Field=>({name,label,type:'date'});

export const featureCatalog: Record<Role, Record<string, Feature>> = {
  student: {
    'المواد': f('المواد الدراسية','تصفح المواد والملخصات والدروس المتاحة.','subjects'),
    'الفيديوهات': f('الفيديوهات','شاهد الشروحات المضافة من المدرسين.','videos'),
    'الكتب': f('الكتب والمذكرات','الوصول إلى ملفات PDF والكتب حسب المادة.','lessons'),
    'الواجبات': f('الواجبات','تابع الواجبات وسلّم إجاباتك قبل الموعد.', 'assignments',[text('title','ملاحظات التسليم'),text('fileUrl','رابط الملف (اختياري)')],'create'),
    'الامتحانات': f('الامتحانات','اعرض الامتحانات المتاحة وسجل محاولتك.','exams'),
    'الدرجات': f('الدرجات','راجع درجاتك حسب المادة والامتحان.','grades'),
    'الجدول': f('الجدول الدراسي','مواعيد الحصص والامتحانات.','schedule'),
    'الإشعارات': f('الإشعارات','آخر التنبيهات المهمة الخاصة بك.','notifications'),
    'البحث': f('البحث في المحتوى','ابحث في المواد والدروس والفيديوهات.','lessons', [text('query','كلمة البحث','مثال: الجبر')],'search'),
    'المفضلة': f('المفضلة','العناصر التي حفظتها للرجوع إليها.','favorites'),
    'الملف الشخصي': f('الملف الشخصي','بيانات حسابك الأساسية.','users'),
    'الإعدادات': f('الإعدادات','تفضيلات العرض والجلسة.','settings',[], 'theme')
  },
  teacher: {
    'ملفات الدروس': f('ملفات الدروس','أضف PDF أو صورة أو مستندًا تعليميًا، وصنّفه حسب المادة.','lessons',[text('title','عنوان الدرس'),text('subject','المادة'),{name:'file',label:'ملف الدرس',type:'file',accept:'.pdf,.png,.jpg,.jpeg,.gif,.webp,.doc,.docx,.ppt,.pptx,application/pdf,image/*'}],'uploadFile'),
    'رفع PDF': f('ملفات الدروس','أضف PDF أو صورة أو مستندًا تعليميًا، وصنّفه حسب المادة.','lessons',[text('title','عنوان الدرس'),text('subject','المادة'),{name:'file',label:'ملف الدرس',type:'file',accept:'.pdf,.png,.jpg,.jpeg,.gif,.webp,.doc,.docx,.ppt,.pptx,application/pdf,image/*'}],'uploadFile'),
    'فيديو YouTube': f('إضافة فيديو من YouTube','ألصق رابط YouTube فقط؛ تستخرج المنصة العنوان والصورة المصغّرة والمدة تلقائيًا.','videos',[text('url','رابط YouTube')],'youtube'),
    'إدارة المحتوى': f('إدارة المحتوى','تصفّح مكتبة ملفات الدروس وفيديوهات YouTube، واعرضها حسب المادة.','lessons',undefined,'contentManager'),
    'إدارة الدروس': f('إدارة المحتوى','تصفّح مكتبة ملفات الدروس وفيديوهات YouTube، واعرضها حسب المادة.','lessons',undefined,'contentManager'),
    'إنشاء امتحان': f('إنشاء امتحان','أنشئ امتحانًا وحدد المادة والمدة.','exams',[text('title','اسم الامتحان'),text('subject','المادة'),{name:'duration',label:'المدة بالدقائق',type:'number'}],'create'),
    'الواجبات': f('إدارة الواجبات','انشر واجبًا وحدد موعد التسليم.','assignments',[text('title','عنوان الواجب'),text('subject','المادة'),date('dueDate','آخر موعد'),{name:'studentId',label:'معرف الطالب (اختياري)',required:false}],'create'),
    'الحضور': f('تسجيل الحضور','سجّل حضور طالب في يوم محدد.','attendance',[text('studentId','معرف الطالب'),date('date','التاريخ'),text('status','الحالة','حاضر / غائب / متأخر')],'create'),
    'التصحيح': f('التصحيح والدرجات','أضف درجة الطالب مع ربطها بالمادة.','grades',[text('studentId','معرف الطالب'),text('subject','المادة'),{name:'score',label:'الدرجة',type:'number'},{name:'total',label:'من',type:'number'}],'create'),
    'الإحصائيات': f('إحصائيات المدرس','ملخص المحتوى والواجبات والامتحانات.','lessons'),
    'بنك الأسئلة': f('بنك الأسئلة','أضف سؤالًا لاستخدامه في الامتحانات.','questions',[text('question','نص السؤال'),text('answer','الإجابة الصحيحة'),text('subject','المادة')],'create')
  },
  parent: {
    'الحضور': f('متابعة الحضور','سجل حضور الأبناء المرتبطين بحسابك.','attendance'),
    'الدرجات': f('درجات الأبناء','تابع نتائج الأبناء حسب المادة.','grades'),
    'الواجبات': f('واجبات الأبناء','اعرف الواجبات المفتوحة ومواعيدها.','assignments'),
    'الرسائل': f('الرسائل','تواصل مع المدرسة أو المدرس.','messages',[text('recipientId','معرف المستلم'),text('subject','عنوان الرسالة'),text('body','نص الرسالة')],'create'),
    'الإشعارات': f('الإشعارات','التنبيهات المرسلة إلى ولي الأمر.','notifications'),
    'التقارير': f('التقارير','التقارير الدراسية والحضور.','reports')
  },
  admin: {
    'إدارة المستخدمين': f('إدارة المستخدمين','عرض المستخدمين وتعيين أدوارهم من خلال Function آمنة.','users',[text('uid','معرف المستخدم'),text('role','الدور','student / teacher / parent / admin')],'role'),
    'الأخبار': f('إدارة الأخبار','انشر أخبار المدرسة وإعلاناتها.','news',[text('title','عنوان الخبر'),text('body','نص الخبر'),text('tag','التصنيف')],'create'),
    'الإحصائيات': f('إحصائيات المنصة','ملخص المستخدمين والمحتوى.','users'),
    'التقارير': f('التقارير الإدارية','تقارير الاستخدام والحضور والدرجات.','reports'),
    'المواد': f('إدارة المواد','إضافة وتعديل المواد الدراسية.','subjects',[text('name','اسم المادة'),text('grade','الصف')],'create'),
    'النسخ الاحتياطي': f('النسخ الاحتياطي','اطلب نسخة بيانات مصدّرة من الخادم.','reports',[], 'export'),
    'الإعدادات': f('إعدادات النظام','تفضيلات العرض وخروج الجلسة.',undefined,[], 'theme')
  }
};
