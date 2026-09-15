import streamlit as st
import psycopg2
import pandas as pd

st.set_page_config(page_title="Control Estudiantil", layout="wide")

@st.cache_resource
def init_connection():
    conn = psycopg2.connect(dbname="magnolias", user="postgres", host="localhost")
    conn.autocommit = True
    return conn

try:
    conn = init_connection()
    cursor = conn.cursor()
except Exception as e:
    st.error(f"Error crítico al conectar: {e}")
    st.stop()

st.title("SISTEMA DE CONTROL ESTUDIANTIL")

tab1, tab2, tab3, tab4 = st.tabs([
    "🔑 Credenciales", 
    "📝 Registrar Avance y Calificaciones", 
    "📊 Ver Avances por Alumno",
    "📈 Resumen General"
])

# --- PESTAÑA 1: CREDENCIALES ---
with tab1:
    st.header("Búsqueda rápida de Usuarios")
    busqueda = st.text_input("Escribe el nombre del alumno:")
    try:
        if busqueda:
            df = pd.read_sql("SELECT nombre, usuario, contrasena FROM Alumnos WHERE nombre ILIKE %s", conn, params=('%' + busqueda + '%',))
        else:
            df = pd.read_sql("SELECT nombre, usuario, contrasena FROM Alumnos ORDER BY nombre", conn)
        st.dataframe(df, use_container_width=True, hide_index=True)
    except Exception as e:
        st.error(f"Error: {e}")

# --- CATALOGO GLOBAL ---
try:
    cursor.execute("SELECT id_alumno, nombre FROM Alumnos ORDER BY nombre")
    alumnos = cursor.fetchall()
    nombres_alumnos = [a[1] for a in alumnos]
except:
    alumnos, nombres_alumnos = [], []

# --- PESTAÑA 2: REGISTRAR AVANCE ---
with tab2:
    st.header("Captura de Cumplimiento y Calificaciones")
    
    if alumnos:
        alumno_sel = st.selectbox("1. Selecciona un Alumno", nombres_alumnos)
        if alumno_sel:
            id_al = next(a[0] for a in alumnos if a[1] == alumno_sel)
            
            try:
                cursor.execute("""
                    SELECT m.id_materia, m.nombre_materia FROM Materias m
                    JOIN Alumno_Materia am ON m.id_materia = am.id_materia
                    WHERE am.id_alumno = %s
                """, (id_al,))
                materias = cursor.fetchall()
                nombres_materias = [m[1] for m in materias]
            except:
                materias, nombres_materias = [], []
            
            if nombres_materias:
                materia_sel = st.selectbox("2. Selecciona la Materia", nombres_materias)
                
                tipo_captura = st.radio("3. ¿Qué deseas registrar?", ["Avance Semanal", "Parcial o Integrador"], horizontal=True)
                
                if tipo_captura == "Avance Semanal":
                    col1, col2, col3 = st.columns(3)
                    with col1:
                        semana_sel = st.number_input("Semana (1-52)", min_value=1, max_value=52, step=1)
                    with col2:
                        estatus_sel = st.selectbox("Estatus", ["Cumplió", "No Cumplió", "Pendiente"])
                    
                    if st.button("Guardar Semana", type="primary"):
                        id_mat = next(m[0] for m in materias if m[1] == materia_sel)
                        try:
                            cursor.execute("SELECT id_avance FROM Avances WHERE id_alumno = %s AND id_materia = %s AND semana = %s AND tipo_registro = 'Semanal'", (id_al, id_mat, semana_sel))
                            existe = cursor.fetchone()
                            if existe:
                                cursor.execute("UPDATE Avances SET estatus = %s, fecha_registro = CURRENT_TIMESTAMP WHERE id_avance = %s", (estatus_sel, existe[0]))
                            else:
                                cursor.execute("INSERT INTO Avances (id_alumno, id_materia, semana, tipo_registro, estatus) VALUES (%s, %s, %s, 'Semanal', %s)", (id_al, id_mat, semana_sel, estatus_sel))
                            st.success(f"¡Semana {semana_sel} actualizada a '{estatus_sel}'!")
                        except Exception as e:
                            st.error(f"Error: {e}")
                
                else:
                    col1, col2, col3, col4 = st.columns(4)
                    with col1:
                        tipo_sel = st.selectbox("Evaluación", ["Parcial", "Integrador"])
                    with col2:
                        num_eval = st.number_input(f"Número (Ej. {tipo_sel} 1, 2...)", min_value=1, max_value=10, step=1)
                    with col3:
                        estatus_sel = st.selectbox("Entrega", ["Cumplió", "No Cumplió", "Pendiente"])
                    with col4:
                        calificacion_sel = st.number_input("Calificación (0 = N/A)", min_value=0.0, max_value=10.0, step=0.1)
                        
                    if st.button("Guardar Evaluación Mayor", type="primary"):
                        id_mat = next(m[0] for m in materias if m[1] == materia_sel)
                        try:
                            cursor.execute("""
                                SELECT id_avance FROM Avances 
                                WHERE id_alumno = %s AND id_materia = %s AND tipo_registro = %s AND num_evaluacion = %s
                            """, (id_al, id_mat, tipo_sel, num_eval))
                            existe = cursor.fetchone()
                            
                            calif_final = calificacion_sel if calificacion_sel > 0 else None
                            
                            if existe:
                                cursor.execute("UPDATE Avances SET estatus = %s, calificacion = %s, fecha_registro = CURRENT_TIMESTAMP WHERE id_avance = %s", (estatus_sel, calif_final, existe[0]))
                                st.success(f"¡{tipo_sel} {num_eval} actualizado! Estatus: {estatus_sel}")
                            else:
                                cursor.execute("""
                                    INSERT INTO Avances (id_alumno, id_materia, semana, tipo_registro, num_evaluacion, estatus, calificacion) 
                                    VALUES (%s, %s, 0, %s, %s, %s, %s)
                                """, (id_al, id_mat, tipo_sel, num_eval, estatus_sel, calif_final))
                                st.success(f"¡{tipo_sel} {num_eval} registrado correctamente!")
                        except Exception as e:
                            st.error(f"Error: {e}")
            else:
                st.warning("Este alumno no tiene materias asignadas.")

# --- PESTAÑA 3: VER AVANCES POR ALUMNO ---
with tab3:
    st.header("Historial de Avances y Calificaciones")
    if alumnos:
        alumno_consulta = st.selectbox("Selecciona un Alumno", nombres_alumnos, key="consulta_al")
        if alumno_consulta:
            id_al_cons = next(a[0] for a in alumnos if a[1] == alumno_consulta)
            
            try:
                # --- FILTROS EN PANTALLA ---
                cursor.execute("SELECT DISTINCT semana FROM Avances WHERE id_alumno = %s AND tipo_registro = 'Semanal' ORDER BY semana ASC", (id_al_cons,))
                semanas_alumno = [row[0] for row in cursor.fetchall()]
                
                cursor.execute("""
                    SELECT m.nombre_materia FROM Materias m
                    JOIN Alumno_Materia am ON m.id_materia = am.id_materia
                    WHERE am.id_alumno = %s ORDER BY m.nombre_materia ASC
                """, (id_al_cons,))
                materias_alumno = [row[0] for row in cursor.fetchall()]
                
                st.markdown("### 🔍 Panel de Filtros")
                col_f1, col_f2, col_f3 = st.columns(3)
                
                with col_f1:
                    opciones_sem = ["Todas las semanas"] + semanas_alumno
                    filtro_sem = st.selectbox("📅 Semana:", opciones_sem, key="f_sem")
                with col_f2:
                    opciones_mat = ["Todas las materias"] + materias_alumno
                    filtro_mat = st.selectbox("📚 Materia:", opciones_mat, key="f_mat")
                with col_f3:
                    filtro_est = st.selectbox("✅ Estatus:", ["Todos", "Cumplió", "No Cumplió", "Pendiente"], key="f_est")
                
                st.markdown("---")
                
                # --- TABLA 1: EVALUACIONES MAYORES ---
                st.subheader("🎓 Parciales e Integradores")
                query_mayores = """
                    SELECT m.nombre_materia AS "Materia", 
                           av.tipo_registro || ' ' || av.num_evaluacion AS "Evaluación", 
                           av.estatus AS "Entrega", av.calificacion AS "Calificación", 
                           av.fecha_registro AS "Última Modificación"
                    FROM Avances av JOIN Materias m ON av.id_materia = m.id_materia
                    WHERE av.id_alumno = %s AND av.tipo_registro IN ('Parcial', 'Integrador')
                """
                params_may = [id_al_cons]
                
                if filtro_mat != "Todas las materias":
                    query_mayores += " AND m.nombre_materia = %s"
                    params_may.append(filtro_mat)
                if filtro_est != "Todos":
                    query_mayores += " AND av.estatus = %s"
                    params_may.append(filtro_est)
                    
                query_mayores += " ORDER BY m.nombre_materia ASC, av.tipo_registro ASC, av.num_evaluacion ASC"
                
                df_mayores = pd.read_sql(query_mayores, conn, params=tuple(params_may))
                if df_mayores.empty:
                    st.info("No hay Parciales o Integradores que coincidan con estos filtros.")
                else:
                    st.dataframe(df_mayores, use_container_width=True, hide_index=True)
                
                # --- TABLA 2: HISTORIAL SEMANAL ---
                st.subheader("📅 Historial Semanal")
                query_sem = """
                    SELECT av.semana AS "Semana", m.nombre_materia AS "Materia", 
                           av.estatus AS "Estatus", av.fecha_registro AS "Fecha de Registro"
                    FROM Avances av JOIN Materias m ON av.id_materia = m.id_materia
                    WHERE av.id_alumno = %s AND av.tipo_registro = 'Semanal'
                """
                params_sem = [id_al_cons]
                
                if filtro_sem != "Todas las semanas":
                    query_sem += " AND av.semana = %s"
                    params_sem.append(filtro_sem)
                if filtro_mat != "Todas las materias":
                    query_sem += " AND m.nombre_materia = %s"
                    params_sem.append(filtro_mat)
                if filtro_est != "Todos":
                    query_sem += " AND av.estatus = %s"
                    params_sem.append(filtro_est)
                    
                query_sem += " ORDER BY av.semana DESC, m.nombre_materia ASC"
                
                df_sem = pd.read_sql(query_sem, conn, params=tuple(params_sem))
                if df_sem.empty:
                    st.info("No hay registros semanales que coincidan con estos filtros.")
                else:
                    st.dataframe(df_sem, use_container_width=True, hide_index=True)
                
                # --- BOTÓN DE EXPORTACIÓN UNIFICADO DE PENDIENTES ---
                st.markdown("---")
                st.subheader("📥 Generar Reporte de Pendientes")
                st.write("Este botón exportará un archivo unificado con todo lo que el alumno debe, separado por categorías.")
                
                # 1. Buscamos Mayores Pendientes
                query_exp_may = """
                    SELECT m.nombre_materia AS "Materia", 
                           av.tipo_registro || ' ' || av.num_evaluacion AS "Evaluación", 
                           av.fecha_registro AS "Fecha de Asignación"
                    FROM Avances av JOIN Materias m ON av.id_materia = m.id_materia
                    WHERE av.id_alumno = %s AND av.tipo_registro IN ('Parcial', 'Integrador') AND av.estatus = 'Pendiente'
                    ORDER BY m.nombre_materia ASC
                """
                df_exp_may = pd.read_sql(query_exp_may, conn, params=(id_al_cons,))
                
                # 2. Buscamos Semanas Pendientes
                query_exp_sem = """
                    SELECT m.nombre_materia AS "Materia", av.semana AS "Semana Adeudada", 
                           av.fecha_registro AS "Fecha de Asignación"
                    FROM Avances av JOIN Materias m ON av.id_materia = m.id_materia
                    WHERE av.id_alumno = %s AND av.tipo_registro = 'Semanal' AND av.estatus = 'Pendiente'
                    ORDER BY av.semana DESC, m.nombre_materia ASC
                """
                df_exp_sem = pd.read_sql(query_exp_sem, conn, params=(id_al_cons,))
                
                # 3. Construimos el CSV estructurado en texto
                csv_content = f"REPORTE DE PENDIENTES: {alumno_consulta.upper()}\n\n"
                
                csv_content += "--- PARCIALES E INTEGRADORES PENDIENTES ---\n"
                if df_exp_may.empty:
                    csv_content += "Al corriente. No hay pendientes en esta area.\n"
                else:
                    csv_content += df_exp_may.to_csv(index=False)
                    
                csv_content += "\n--- ACTIVIDADES SEMANALES PENDIENTES ---\n"
                if df_exp_sem.empty:
                    csv_content += "Al corriente. No hay pendientes en esta area.\n"
                else:
                    csv_content += df_exp_sem.to_csv(index=False)
                
                # 4. Creamos el botón de descarga
                nombre_archivo = f"Pendientes_{alumno_consulta.replace(' ', '_')}.csv"
                st.download_button(
                    label=f"📥 Descargar Pendientes de {alumno_consulta.split()[0]}",
                    data=csv_content.encode('utf-8'),
                    file_name=nombre_archivo,
                    mime="text/csv",
                    type="primary"
                )
                    
            except Exception as e:
                st.error(f"Error: {e}")

# --- PESTAÑA 4: RESUMEN GENERAL ---
with tab4:
    st.header("Tablero General de Semanas (Solo Seguimiento Regular)")
    try:
        cursor.execute("SELECT DISTINCT semana FROM Avances WHERE tipo_registro = 'Semanal' ORDER BY semana ASC")
        resultado_semanas = cursor.fetchall()
        
        if not resultado_semanas:
            st.info("Aún no hay avances semanales registrados.")
        else:
            semanas_registradas = [row[0] for row in resultado_semanas]
            
            st.markdown("### 🔍 Controles del Tablero")
            col_g1, col_g2 = st.columns(2)
            
            with col_g1:
                opciones_global = ["Todas las semanas"] + semanas_registradas
                semana_filtro_gen = st.selectbox("📅 Filtrar por Semana:", opciones_global, index=len(opciones_global) - 1, key="filtro_gen")
            with col_g2:
                # Nuevo filtro para aislar a los alumnos problemáticos o al corriente
                estatus_filtro_gen = st.selectbox("🎯 Mostrar alumnos que estén:", ["Todos", "Solo con Pendientes", "Solo con Faltas (No Cumplió)", "Al Corriente"])
            
            if semana_filtro_gen == "Todas las semanas":
                query_general = """
                    SELECT a.nombre AS "Alumno",
                        COUNT(CASE WHEN av.estatus = 'Cumplió' THEN 1 END) AS "Completados",
                        COUNT(CASE WHEN av.estatus = 'No Cumplió' THEN 1 END) AS "No Cumplió",
                        COUNT(CASE WHEN av.estatus = 'Pendiente' THEN 1 END) AS "Pendientes",
                        COUNT(av.id_avance) AS "Total Registros"
                    FROM Alumnos a LEFT JOIN Avances av ON a.id_alumno = av.id_alumno AND av.tipo_registro = 'Semanal'
                    GROUP BY a.id_alumno, a.nombre ORDER BY a.nombre;
                """
                df_general = pd.read_sql(query_general, conn)
            else:
                query_general = """
                    SELECT a.nombre AS "Alumno",
                        COUNT(CASE WHEN av.estatus = 'Cumplió' THEN 1 END) AS "Completados",
                        COUNT(CASE WHEN av.estatus = 'No Cumplió' THEN 1 END) AS "No Cumplió",
                        COUNT(CASE WHEN av.estatus = 'Pendiente' THEN 1 END) AS "Pendientes",
                        COUNT(av.id_avance) AS "Total Registros"
                    FROM Alumnos a LEFT JOIN Avances av ON a.id_alumno = av.id_alumno AND av.tipo_registro = 'Semanal' AND av.semana = %s
                    GROUP BY a.id_alumno, a.nombre ORDER BY a.nombre;
                """
                df_general = pd.read_sql(query_general, conn, params=(semana_filtro_gen,))
            
            def asignar_estado(row):
                if row["Total Registros"] == 0: return "➖ Sin registros"
                elif row["Pendientes"] > 0: return "⏳ Con Pendientes"
                elif row["No Cumplió"] > 0: return "❌ Faltas Detectadas"
                else: return "✅ Al Corriente"
            
            df_general["Estatus Global"] = df_general.apply(asignar_estado, axis=1)
            
            # Aplicamos el filtro visual seleccionado en el selector de la derecha
            if estatus_filtro_gen == "Solo con Pendientes":
                df_general = df_general[df_general["Pendientes"] > 0]
            elif estatus_filtro_gen == "Solo con Faltas (No Cumplió)":
                df_general = df_general[df_general["No Cumplió"] > 0]
            elif estatus_filtro_gen == "Al Corriente":
                df_general = df_general[df_general["Estatus Global"] == "✅ Al Corriente"]

            df_general = df_general[["Alumno", "Estatus Global", "Completados", "No Cumplió", "Pendientes", "Total Registros"]]
            
            st.markdown("---")
            if df_general.empty:
                st.info(f"Ningún alumno coincide con el filtro '{estatus_filtro_gen}' en esta semana.")
            else:
                st.dataframe(df_general, use_container_width=True, hide_index=True)
                
                st.markdown("---")
                df_grafica = df_general[df_general["Total Registros"] > 0].set_index("Alumno")[["Completados", "No Cumplió", "Pendientes"]]
                if not df_grafica.empty: 
                    st.bar_chart(df_grafica, use_container_width=True)
    except Exception as e:
        st.error(f"Error SQL: {e}")